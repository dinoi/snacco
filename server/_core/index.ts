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
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import fs from "fs";

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

  // ── Video proxy: stream from S3 with Range support and browser caching ──
  // In-memory metadata cache: avoids HeadObject round trip on every range request.
  // The browser makes 3-5 range requests per video (moov atom probe, then data chunks).
  // Without cache: each request = HeadObject (200ms) + GetObject (200ms) = 400ms × 5 = 2s minimum.
  // With cache: first request = HeadObject + GetObject, subsequent = GetObject only.
  const videoMetaCache = new Map<string, { totalSize: number; contentType: string; cachedAt: number }>();
  const META_CACHE_TTL = 3600_000; // 1 hour

  async function getVideoMeta(client: S3Client, bucket: string, key: string) {
    const cached = videoMetaCache.get(key);
    if (cached && Date.now() - cached.cachedAt < META_CACHE_TTL) {
      return { totalSize: cached.totalSize, contentType: cached.contentType };
    }
    const headResp = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const meta = {
      totalSize: headResp.ContentLength ?? 0,
      contentType: headResp.ContentType ?? "video/mp4",
      cachedAt: Date.now(),
    };
    videoMetaCache.set(key, meta);
    // Cap cache size at 200 entries
    if (videoMetaCache.size > 200) {
      const oldest = videoMetaCache.keys().next().value;
      if (oldest) videoMetaCache.delete(oldest);
    }
    return { totalSize: meta.totalSize, contentType: meta.contentType };
  }

  function pipeS3Body(body: any, res: Response) {
    if (body && typeof body.pipe === "function") {
      (body as Readable).pipe(res);
    } else if (body) {
      const webStream = body.transformToWebStream();
      Readable.fromWeb(webStream as any).pipe(res);
    } else {
      res.status(500).json({ error: "Empty S3 response" });
    }
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
      const rangeHeader = req.headers.range;

      // For non-Range requests, skip HeadObject entirely — get size from GetObject response
      if (!rangeHeader) {
        const getResp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const totalSize = getResp.ContentLength ?? 0;
        const contentType = getResp.ContentType ?? "video/mp4";

        // Cache metadata for future range requests
        videoMetaCache.set(key, { totalSize, contentType, cachedAt: Date.now() });

        res.status(200);
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", totalSize);
        pipeS3Body(getResp.Body, res);
        return;
      }

      // Range request — need metadata for validation
      const { totalSize, contentType } = await getVideoMeta(client, bucket, key);

      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);

      if (totalSize === 0) {
        res.status(200);
        res.setHeader("Content-Length", 0);
        res.end();
        return;
      }

      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416);
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        res.json({ error: "Invalid range" });
        return;
      }

      const start = parseInt(match[1], 10);
      const rawEnd = match[2] ? parseInt(match[2], 10) : totalSize - 1;
      const end = Math.min(rawEnd, totalSize - 1);

      if (start >= totalSize || start > end) {
        res.status(416);
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        res.json({ error: "Range not satisfiable" });
        return;
      }

      const chunkSize = end - start + 1;
      const getResp = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }));

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      res.setHeader("Content-Length", chunkSize);
      pipeS3Body(getResp.Body, res);
    } catch (err: any) {
      console.error("[VideoProxy] Error streaming:", key, err?.message);
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
