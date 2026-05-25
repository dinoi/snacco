import type { Express } from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";

// Disk storage: stream directly to /tmp as it arrives — no RAM buffering.
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
        let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
        try {
          user = await sdk.authenticateRequest(req);
        } catch {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "No file provided" });
        }

        const type = req.body?.type as string;
        if (!type || !["demo", "tutorial"].includes(type)) {
          return res.status(400).json({ error: "type must be 'demo' or 'tutorial'" });
        }

        // Read from disk and upload to S3 via server-side storagePut
        // storagePut uses the internal Forge API — no CORS, no presign needed.
        const fileBuffer = fs.readFileSync(tmpPath);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const inputKey = `videos/${user.id}/${type}/${Date.now()}_${safeName}`;

        const { key: storedKey, url } = await storagePut(
          inputKey,
          fileBuffer,
          file.mimetype || "video/mp4"
        );

        return res.json({ key: storedKey, url });
      } catch (err: any) {
        console.error("[Upload] Error:", err);
        return res.status(500).json({ error: err?.message ?? "Upload failed" });
      } finally {
        // Always clean up the temp file
        if (tmpPath) {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      }
    }
  );
}
