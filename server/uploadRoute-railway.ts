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

        // Stream file directly to Railway Object Storage (avoid buffering large files)
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `videos/${user.id}/${type}/${Date.now()}_${safeName}`;

        const { key: storedKey, url } = await storage.storagePutStream(key, tmpPath, file.mimetype || "video/mp4");

        return res.json({ key: storedKey, url });
      } catch (err: any) {
        console.error("[Upload] Error:", err);
        return res.status(500).json({ error: err?.message ?? "Upload failed" });
      } finally {
        // Always clean up the temp file
        if (tmpPath) {
          try {
            fs.unlinkSync(tmpPath);
          } catch {
            /* ignore */
          }
        }
      }
    }
  );
}
