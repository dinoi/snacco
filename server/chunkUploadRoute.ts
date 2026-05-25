import type { Express } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

// In-memory registry: uploadId -> { totalChunks, received: Set<number>, dir: string }
const chunkRegistry = new Map<string, { totalChunks: number; received: Set<number>; dir: string }>();

function getChunkDir(uploadId: string): string {
  return path.join(os.tmpdir(), `snacco_chunk_${uploadId}`);
}

function chunkPath(dir: string, index: number): string {
  return path.join(dir, `chunk_${String(index).padStart(6, "0")}`);
}

// Multer config: store chunks as raw files on disk
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `snacco_chunk_${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per chunk (well under gateway limit)
});

export function registerChunkUploadRoute(app: Express) {
  app.post(
    "/api/upload-chunk",
    upload.single("chunk"),
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

        const uploadId = req.body?.uploadId as string;
        const chunkIndex = parseInt(req.body?.chunkIndex as string);
        const totalChunks = parseInt(req.body?.totalChunks as string);
        const fileName = req.body?.fileName as string;
        const mimeType = req.body?.mimeType as string || "video/mp4";
        const type = req.body?.type as string;

        if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks)) {
          return res.status(400).json({ error: "Missing uploadId, chunkIndex, or totalChunks" });
        }

        if (!type || !["demo", "tutorial"].includes(type)) {
          return res.status(400).json({ error: "type must be 'demo' or 'tutorial'" });
        }

        if (!req.file) {
          return res.status(400).json({ error: "No chunk file provided" });
        }

        const dir = getChunkDir(uploadId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Move chunk from temp location to chunk dir
        const targetPath = chunkPath(dir, chunkIndex);
        if (!tmpPath) throw new Error(`No temp file for chunk ${chunkIndex}`);
        if (!fs.existsSync(tmpPath)) throw new Error(`Temp file not found at ${tmpPath}`);
        try {
          fs.renameSync(tmpPath, targetPath);
        } catch (renameErr: any) {
          throw new Error(`Failed to move chunk ${chunkIndex} from ${tmpPath} to ${targetPath}: ${renameErr?.message}`);
        }

        // Track received chunks
        let entry = chunkRegistry.get(uploadId);
        if (!entry) {
          entry = { totalChunks, received: new Set(), dir };
          chunkRegistry.set(uploadId, entry);
        }
        entry.received.add(chunkIndex);

        const isLast = entry.received.size === totalChunks;

        if (!isLast) {
          return res.json({ done: false, received: entry.received.size, total: totalChunks });
        }

        // All chunks received — reassemble and upload to S3
        try {
          const parts: Buffer[] = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkFile = chunkPath(dir, i);
            if (!fs.existsSync(chunkFile)) {
              throw new Error(`Chunk ${i} not found at ${chunkFile}`);
            }
            parts.push(fs.readFileSync(chunkFile));
          }
          const fullBuffer = Buffer.concat(parts);
          console.log(`[ChunkUpload] Reassembled ${totalChunks} chunks (${fullBuffer.length} bytes) for uploadId ${uploadId}`);

          // Upload to S3 via server-side Forge API
          const { forgeUrl, forgeKey } = getForgeConfig();
          const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `videos/${user.id}/${type}/${Date.now()}_${safeName}`;

          // Get presigned PUT URL
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

          // PUT to S3
          const uploadResp = await fetch(s3Url, {
            method: "PUT",
            headers: { "Content-Type": mimeType || "video/mp4" },
            body: fullBuffer,
          });
          if (!uploadResp.ok) {
            throw new Error(`S3 upload failed (${uploadResp.status})`);
          }

          // Clean up temp files
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
          chunkRegistry.delete(uploadId);

          return res.json({ done: true, key, url: `/manus-storage/${key}` });
        } catch (err: any) {
          // Clean up on error
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
          chunkRegistry.delete(uploadId);
          console.error("[ChunkUpload] Assembly error:", err);
          return res.status(500).json({ error: err?.message ?? "Upload assembly failed" });
        }
      } catch (err: any) {
        console.error("[ChunkUpload] Error:", err);
        return res.status(500).json({ error: err?.message ?? "Upload failed" });
      } finally {
        // Clean up temp file if still exists
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
