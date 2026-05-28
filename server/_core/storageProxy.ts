import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // If Railway provides a public URL, redirect there directly
    const publicUrl = ENV.railwayStoragePublicUrl;
    if (publicUrl) {
      const url = `${publicUrl.replace(/\/+$/, "")}/${key}`;
      res.set("Cache-Control", "public, max-age=86400");
      res.redirect(307, url);
      return;
    }

    // Otherwise, try Manus Forge API as fallback
    if (ENV.forgeApiUrl && ENV.forgeApiKey) {
      try {
        const forgeUrl = new URL(
          "v1/storage/presign/get",
          ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
        );
        forgeUrl.searchParams.set("path", key);

        const forgeResp = await fetch(forgeUrl, {
          headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
        });

        if (forgeResp.ok) {
          const { url } = (await forgeResp.json()) as { url: string };
          if (url) {
            res.set("Cache-Control", "no-store");
            res.redirect(307, url);
            return;
          }
        }
      } catch (err) {
        console.error("[StorageProxy] Forge fallback failed:", err);
      }
    }

    // Last resort: try Railway S3 signed URL
    try {
      const { storageGetSignedUrl } = await import("../storage");
      const signedUrl = await storageGetSignedUrl(key);
      res.set("Cache-Control", "public, max-age=3600");
      res.redirect(307, signedUrl);
    } catch (err) {
      console.error("[StorageProxy] S3 signed URL failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
