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

  // Video proxy: stream from S3 with Range support and browser caching
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

      // First, get the object metadata (size, content-type)
      const headCmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const headResp = await client.send(headCmd);
      const totalSize = headResp.ContentLength ?? 0;
      const contentType = headResp.ContentType ?? "video/mp4";

      // Cache for 24 hours — stable URL means browser can reuse across pages
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);

      // Handle zero-size objects
      if (totalSize === 0) {
        res.status(200);
        res.setHeader("Content-Length", 0);
        res.end();
        return;
      }

      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        // Parse Range header: "bytes=start-end"
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (!match) {
          res.status(416);
          res.setHeader("Content-Range", `bytes */${totalSize}`);
          res.json({ error: "Invalid range" });
          return;
        }
        const start = parseInt(match[1], 10);
        // Clamp end to totalSize - 1; default to totalSize - 1 if not specified
        const rawEnd = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const end = Math.min(rawEnd, totalSize - 1);

        // Validate: start must be within bounds and not exceed end
        if (start >= totalSize || start > end) {
          res.status(416);
          res.setHeader("Content-Range", `bytes */${totalSize}`);
          res.json({ error: "Range not satisfiable" });
          return;
        }

        const chunkSize = end - start + 1;

        // Fetch the range from S3
        const getCmd = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          Range: `bytes=${start}-${end}`,
        });
        const getResp = await client.send(getCmd);

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", chunkSize);

        // Pipe the S3 stream directly to the response (no buffering)
        if (getResp.Body && typeof (getResp.Body as any).pipe === "function") {
          (getResp.Body as Readable).pipe(res);
        } else if (getResp.Body) {
          // Fallback: convert to web stream then to node stream
          const webStream = (getResp.Body as any).transformToWebStream();
          Readable.fromWeb(webStream as any).pipe(res);
        } else {
          res.status(500).json({ error: "Empty S3 response" });
        }
      } else {
        // Full request (no Range header)
        const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
        const getResp = await client.send(getCmd);

        res.status(200);
        res.setHeader("Content-Length", totalSize);

        if (getResp.Body && typeof (getResp.Body as any).pipe === "function") {
          (getResp.Body as Readable).pipe(res);
        } else if (getResp.Body) {
          const webStream = (getResp.Body as any).transformToWebStream();
          Readable.fromWeb(webStream as any).pipe(res);
        } else {
          res.status(500).json({ error: "Empty S3 response" });
        }
      }
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
