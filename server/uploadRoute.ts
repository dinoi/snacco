import type { Express } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

// Use disk storage so large video files are written to /tmp as they stream in.
// This avoids buffering the entire file in RAM and bypasses the gateway body limit.
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
        // (server-side fetch has no CORS restrictions)
        const { forgeUrl, forgeKey } = getForgeConfig();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `videos/${user.id}/${type}/${Date.now()}_${safeName}`;

        // Get presigned PUT URL from Forge using server-side key
        const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
        presignUrl.searchParams.set("path", key);
        const presignResp = await fetch(presignUrl.toString(), {
          headers: { Authorization: `Bearer ${forgeKey}` },
        });
        if (!presignResp.ok) {
          const msg = await presignResp.text().catch(() => presignResp.statusText);
          throw new Error(`Presign failed (${presignResp.status}): ${msg}`);
        }
        const { url: s3Url } = (await presignResp.json()) as { url: string };
        if (!s3Url) throw new Error("Empty presign URL");

        // Read file from disk and PUT to S3
        const fileBuffer = fs.readFileSync(tmpPath);
        const uploadResp = await fetch(s3Url, {
          method: "PUT",
          headers: { "Content-Type": file.mimetype || "video/mp4" },
          body: fileBuffer,
        });
        if (!uploadResp.ok) {
          throw new Error(`S3 upload failed (${uploadResp.status})`);
        }

        return res.json({ key, url: `/manus-storage/${key}` });
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

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) throw new Error("Forge config missing");
  return { forgeUrl, forgeKey };
}
