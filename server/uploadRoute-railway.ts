import type { Express } from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import { parse as parseCookieHeader } from "cookie";
import { verifySessionToken } from "./_core/github-oauth";
import * as db from "./db-postgres";
import * as storage from "./railway-storage";

const COOKIE_NAME = "session_token";

// Use disk storage so large video files are written to /tmp as they stream in.
// This avoids buffering the entire file in RAM.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `snacco_${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB ceiling
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed."));
  },
});

export function registerUploadRoute(app: Express) {
  app.post(
    "/api/upload-video",
    upload.single("video"),
    async (req: any, res: any) => {
      const tmpPath = req.file?.path;
      let fastStartPath: string | null = null;
      try {
        // Authenticate via session cookie
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) {
          return res.status(401).json({ error: "Unauthorized: no session" });
        }

        const cookies = parseCookieHeader(cookieHeader);
        const sessionToken = cookies[COOKIE_NAME];

        if (!sessionToken) {
          return res.status(401).json({ error: "Unauthorized: no token" });
        }

        const payload = await verifySessionToken(sessionToken);
        if (!payload) {
          return res.status(401).json({ error: "Unauthorized: invalid token" });
        }

        const user = await db.getUserById(payload.userId);
        if (!user) {
          return res.status(401).json({ error: "Unauthorized: user not found" });
        }

        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "No file provided" });
        }

        const type = req.body?.type as string;
        if (!type || !["demo", "tutorial"].includes(type)) {
          return res.status(400).json({ error: "type must be 'demo' or 'tutorial'" });
        }

        // Move moov atom to front (fast-start) for instant playback
        // Only process files under 200MB to stay within 512MB Railway RAM limit
        // (need ~2.5x file size in RAM: input buffer + output buffer + overhead)
        let uploadPath = tmpPath;
        const fileStats = fs.statSync(tmpPath);
        const MAX_FASTSTART_SIZE = 200 * 1024 * 1024; // 200MB
        if (fileStats.size <= MAX_FASTSTART_SIZE && file.mimetype === "video/mp4") {
          try {
            const { faststart } = await import("@fyreware/moov-faststart");
            const inputBuffer = fs.readFileSync(tmpPath);
            const outputBuffer = faststart(inputBuffer);
            if (outputBuffer && outputBuffer.length > 0) {
              fastStartPath = tmpPath + ".faststart.mp4";
              fs.writeFileSync(fastStartPath, outputBuffer);
              uploadPath = fastStartPath;
              console.log(`[Upload] Moov atom moved to front (${(fileStats.size / 1024 / 1024).toFixed(1)}MB)`);
            }
          } catch (e) {
            console.warn("[Upload] Fast-start processing skipped:", (e as Error).message);
          }
        } else if (fileStats.size > MAX_FASTSTART_SIZE) {
          console.log(`[Upload] Skipping fast-start for large file (${(fileStats.size / 1024 / 1024).toFixed(1)}MB > 200MB)`);
        }

        // Stream file directly to Railway Object Storage (avoid buffering large files)
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `videos/${user.id}/${type}/${Date.now()}_${safeName}`;

        const { key: storedKey } = await storage.storagePutStream(key, uploadPath, file.mimetype || "video/mp4");

        // Return proxy URL (Railway S3 buckets are private, no public URLs)
        return res.json({ key: storedKey, url: `/api/video/${storedKey}` });
      } catch (err: any) {
        console.error("[Upload] Error:", err);
        return res.status(500).json({ error: err?.message ?? "Upload failed" });
      } finally {
        // Always clean up temp files
        if (tmpPath) {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
        if (fastStartPath) {
          try { fs.unlinkSync(fastStartPath); } catch { /* ignore */ }
        }
      }
    }
  );
}
