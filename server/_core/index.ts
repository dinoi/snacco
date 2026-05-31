import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { Request, Response } from "express";
import { registerGitHubOAuthRoutes } from "./github-oauth";
import { appRouter } from "../routers";
import { createContext } from "./context-github";
import { serveStatic, setupVite } from "./vite";
import { registerUploadRoute } from "../uploadRoute-railway";
import { ENV } from "./env";
import { getLocalFilePath, getS3Client } from "../railway-storage";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Apply JSON/urlencoded body parsers to all routes EXCEPT the multipart upload endpoint.
  // The upload route is handled by multer which has its own 350MB limit.
  // If express.json runs first on multipart requests it rejects them at 50MB (413).
  app.use((req, res, next) => {
    if (req.path === "/api/upload-video") return next();
    express.json({ limit: "50mb" })(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.path === "/api/upload-video") return next();
    express.urlencoded({ limit: "50mb", extended: true })(req, res, next);
  });
  // Increase timeout for upload route to handle large files on slow mobile connections
  app.use("/api/upload-video", (req, _res, next) => {
    req.setTimeout(10 * 60 * 1000); // 10 minutes
    next();
  });
  registerGitHubOAuthRoutes(app);
  registerUploadRoute(app);
  
  // Serve local storage files
  app.get("/api/storage/:path(*)", (req: Request, res: Response) => {
    const filePath = getLocalFilePath(req.params.path);
    if (!filePath) {
      return res.status(404).json({ error: "File not found" });
    }
    res.sendFile(filePath);
  });

  // ── Video proxy: presigned URL redirect to S3 ──
  // Instead of streaming bytes through the server (which hangs on Railway due to
  // virtual-hosted DNS issues), we generate a presigned S3 URL and redirect.
  // This is much more efficient: no bandwidth through Railway, direct S3 → client.
  // Presigned URLs are cached in-memory to avoid re-signing on every request.
  const presignedCache = new Map<string, { url: string; expiresAt: number }>();
  const PRESIGNED_TTL = 3500_000; // ~58 minutes (URLs expire at 1 hour)

  async function getPresignedVideoUrl(client: S3Client, bucket: string, key: string): Promise<string> {
    const cached = presignedCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.url;
    }
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
    presignedCache.set(key, { url, expiresAt: Date.now() + PRESIGNED_TTL });
    // Cap cache size at 200 entries
    if (presignedCache.size > 200) {
      const oldest = presignedCache.keys().next().value;
      if (oldest) presignedCache.delete(oldest);
    }
    return url;
  }

  app.get("/api/video/:key(*)", async (req: Request, res: Response) => {
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: "Missing key" });

    // Check local storage first
    const localPath = getLocalFilePath(key);
    if (localPath) {
      return res.sendFile(localPath);
    }

    try {
      const client = getS3Client();
      const bucket = ENV.railwayStorageBucket;
      const presignedUrl = await getPresignedVideoUrl(client, bucket, key);
      // 302 redirect — browser follows this and gets video directly from S3.
      // S3 handles Range requests natively, so seeking/scrubbing works automatically.
      res.redirect(302, presignedUrl);
    } catch (err: any) {
      console.error("[VideoProxy] Error generating presigned URL:", key, err?.message);
      if (!res.headersSent) {
        res.status(404).json({ error: "Video not found" });
      }
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
