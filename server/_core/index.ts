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
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
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

  // Video proxy: stream videos from Railway S3 private bucket
  app.get("/api/video/:key(*)", async (req: Request, res: Response) => {
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: "Missing key" });

    // Check local storage first
    const localPath = getLocalFilePath(key);
    if (localPath) {
      return res.sendFile(localPath);
    }

    // Stream from Railway S3
    if (!ENV.railwayStorageEndpoint || !ENV.railwayAccessKeyId || !ENV.railwaySecretAccessKey) {
      return res.status(500).json({ error: "Storage not configured" });
    }

    try {
      const s3 = getS3Client();
      const rangeHeader = req.headers.range;

      // First, get the object metadata to know total size
      // This is critical for video playback — browsers need Content-Length
      const headCommand = new HeadObjectCommand({
        Bucket: ENV.railwayStorageBucket,
        Key: key,
      });
      const headResponse = await s3.send(headCommand);
      const totalSize = headResponse.ContentLength ?? 0;
      const contentType = headResponse.ContentType || "video/mp4";

      if (rangeHeader) {
        // Parse Range header: "bytes=start-end"
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        const getCommand = new GetObjectCommand({
          Bucket: ENV.railwayStorageBucket,
          Key: key,
          Range: `bytes=${start}-${end}`,
        });
        const getResponse = await s3.send(getCommand);

        if (!getResponse.Body) {
          return res.status(404).json({ error: "File not found in storage" });
        }

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        });

        // Convert SDK stream to Node.js Readable and pipe
        const bodyStream = getResponse.Body as any;
        if (typeof bodyStream.transformToByteArray === "function") {
          const bytes = await bodyStream.transformToByteArray();
          res.end(Buffer.from(bytes));
        } else if (typeof bodyStream.pipe === "function") {
          bodyStream.pipe(res);
        } else {
          const bytes = await bodyStream.transformToByteArray();
          res.end(Buffer.from(bytes));
        }
      } else {
        // No Range header — return full file
        const getCommand = new GetObjectCommand({
          Bucket: ENV.railwayStorageBucket,
          Key: key,
        });
        const getResponse = await s3.send(getCommand);

        if (!getResponse.Body) {
          return res.status(404).json({ error: "File not found in storage" });
        }

        res.writeHead(200, {
          "Accept-Ranges": "bytes",
          "Content-Length": totalSize,
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        });

        const bodyStream = getResponse.Body as any;
        if (typeof bodyStream.transformToByteArray === "function") {
          const bytes = await bodyStream.transformToByteArray();
          res.end(Buffer.from(bytes));
        } else if (typeof bodyStream.pipe === "function") {
          bodyStream.pipe(res);
        } else {
          const bytes = await bodyStream.transformToByteArray();
          res.end(Buffer.from(bytes));
        }
      }
    } catch (err: any) {
      console.error("[VideoProxy] Error fetching from S3:", key, err?.message);
      if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: "Video not found" });
      }
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to fetch video" });
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
