import type { Express } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

// Demo: 30s @ ~8Mbps = ~30MB. Tutorial: 5min @ ~8Mbps = ~300MB.
// We set a generous ceiling; real duration enforcement happens client-side.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 350 * 1024 * 1024 }, // 350 MB hard ceiling
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
      try {
        // Authenticate via the same session cookie used by tRPC
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

        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `videos/${user.id}/${type}/${Date.now()}_${safeName}`;
        const { url } = await storagePut(key, file.buffer, file.mimetype);

        return res.json({ key, url });
      } catch (err: any) {
        console.error("[Upload] Error:", err);
        return res.status(500).json({ error: err?.message ?? "Upload failed" });
      }
    }
  );
}
