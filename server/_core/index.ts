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

  // ── Video proxy: streaming proxy from S3 ──
  // Streams video bytes from Railway S3 through the server with proper Range support.
  // Uses forcePathStyle:true in S3 client (see railway-storage.ts).
  //
  // Key optimisations:
  //  • Metadata cache (size + content-type) avoids HeadObject round-trips.
  //  • Non-Range requests skip HeadObject entirely — size is read from the
  //    GetObject response itself, so cold loads pay zero extra latency.
  //  • Vary header removed so CDN/proxy doesn't split cache by Accept-Encoding.
  //  • Cache-Control immutable enables Feed→TutorialDetail cache sharing.
  const metadataCache = new Map<string, { size: number; contentType: string; expiresAt: number }>();
  const METADATA_TTL = 3600_000; // 1 hour

  function cacheMetadata(key: string, size: number, contentType: string) {
    metadataCache.set(key, { size, contentType, expiresAt: Date.now() + METADATA_TTL });
    if (metadataCache.size > 200) {
      const oldest = metadataCache.keys().next().value;
      if (oldest) metadataCache.delete(oldest);
    }
  }

  // AWS SDK v3 Body is a web ReadableStream, NOT a Node.js Readable.
  // `instanceof Readable` is always false. We must convert via
  // Readable.fromWeb() to get a proper Node stream we can .pipe().
  // Without this, transformToByteArray() buffers the ENTIRE video in RAM
  // before sending a single byte — causing timeouts and OOM on Railway.
  function pipeS3Body(body: any, res: Response) {
    if (!body) {
      if (!res.headersSent) res.status(500).end();
      return;
    }
    const nodeStream = typeof body.transformToWebStream === "function"
      ? Readable.fromWeb(body.transformToWebStream() as any)
      : (body instanceof Readable ? body : Readable.from(body));
    nodeStream.on("error", (err) => {
      console.error("[VideoProxy] Stream error:", err?.message);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    nodeStream.pipe(res);
  }

  // ── Diagnostic endpoint: check S3 connectivity ──
  app.get("/api/debug/s3", async (_req: Request, res: Response) => {
    const t0 = Date.now();
    const diag: Record<string, any> = {
      endpoint: ENV.railwayStorageEndpoint || "(not set)",
      bucket: ENV.railwayStorageBucket || "(not set)",
      accessKeySet: !!ENV.railwayAccessKeyId,
      secretKeySet: !!ENV.railwaySecretAccessKey,
    };
    try {
      const client = getS3Client();
      const testKey = "videos/1/demo/1780191267504_jacket_08057125.mp4";
      diag.clientCreated = true;
      diag.clientCreatedMs = Date.now() - t0;

      const t1 = Date.now();
      const head = await Promise.race([
        client.send(new HeadObjectCommand({ Bucket: ENV.railwayStorageBucket, Key: testKey })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("HeadObject timed out after 10s")), 10000)),
      ]) as any;
      diag.headObjectMs = Date.now() - t1;
      diag.headObjectSize = head.ContentLength;
      diag.headObjectType = head.ContentType;
      diag.success = true;
    } catch (err: any) {
      diag.error = err?.message;
      diag.errorName = err?.name;
      diag.success = false;
    }
    diag.totalMs = Date.now() - t0;
    console.log("[S3 Diag]", JSON.stringify(diag));
    res.json(diag);
  });

  // ── Diagnostic: test streaming a small range from S3 ──
  app.get("/api/debug/stream", async (_req: Request, res: Response) => {
    const t0 = Date.now();
    const diag: Record<string, any> = {};
    try {
      const client = getS3Client();
      const testKey = "videos/1/demo/1780191267504_jacket_08057125.mp4";
      const bucket = ENV.railwayStorageBucket;

      // Test 1: GetObject with small range
      const t1 = Date.now();
      const s3Resp = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: testKey, Range: "bytes=0-1023" })
      );
      diag.getObjectMs = Date.now() - t1;
      diag.contentLength = s3Resp.ContentLength;
      diag.contentRange = s3Resp.ContentRange;
      diag.bodyType = s3Resp.Body?.constructor?.name || typeof s3Resp.Body;
      diag.hasTransformToWebStream = typeof (s3Resp.Body as any)?.transformToWebStream === "function";
      diag.hasTransformToByteArray = typeof (s3Resp.Body as any)?.transformToByteArray === "function";
      diag.instanceOfReadable = s3Resp.Body instanceof Readable;

      // Test 2: Try transformToByteArray (known to work but buffers)
      const t2 = Date.now();
      const bytes = await (s3Resp.Body as any).transformToByteArray();
      diag.byteArrayMs = Date.now() - t2;
      diag.bytesReceived = bytes.length;

      // Test 3: Try transformToWebStream on a fresh request
      const t3 = Date.now();
      const s3Resp2 = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: testKey, Range: "bytes=0-1023" })
      );
      diag.getObject2Ms = Date.now() - t3;

      const t4 = Date.now();
      try {
        const webStream = (s3Resp2.Body as any).transformToWebStream();
        diag.webStreamCreated = true;
        const nodeStream = Readable.fromWeb(webStream as any);
        diag.nodeStreamCreated = true;

        // Collect bytes from the node stream
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          nodeStream.on("data", (chunk: Buffer) => chunks.push(chunk));
          nodeStream.on("end", resolve);
          nodeStream.on("error", reject);
          setTimeout(() => reject(new Error("Stream read timed out after 10s")), 10000);
        });
        diag.streamBytes = Buffer.concat(chunks).length;
        diag.streamMs = Date.now() - t4;
        diag.streamSuccess = true;
      } catch (streamErr: any) {
        diag.streamError = streamErr?.message;
        diag.streamMs = Date.now() - t4;
        diag.streamSuccess = false;
      }

      diag.success = true;
    } catch (err: any) {
      diag.error = err?.message;
      diag.success = false;
    }
    diag.totalMs = Date.now() - t0;
    console.log("[S3 Stream Diag]", JSON.stringify(diag));
    res.json(diag);
  });

  // ── Diagnostic: pipe S3 bytes to response (minimal video proxy reproduction) ──
  app.get("/api/debug/pipe", async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const client = getS3Client();
      const testKey = "videos/1/demo/1780191267504_jacket_08057125.mp4";
      const bucket = ENV.railwayStorageBucket;
      const rangeHeader = req.headers.range || "bytes=0-65535";

      console.log(`[PipeDiag] Starting, range=${rangeHeader}`);

      const s3Resp = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: testKey, Range: rangeHeader })
      );
      console.log(`[PipeDiag] GetObject done in ${Date.now() - t0}ms, bodyType=${s3Resp.Body?.constructor?.name}`);

      res.status(206);
      res.set({
        "Content-Type": "video/mp4",
        "Content-Length": String(s3Resp.ContentLength ?? 0),
        "Content-Range": s3Resp.ContentRange ?? "",
        "Accept-Ranges": "bytes",
      });

      // Pipe directly — same as the video proxy
      const body = s3Resp.Body as any;
      if (body instanceof Readable) {
        console.log(`[PipeDiag] Using body.pipe(res) — body is Readable`);
        body.pipe(res);
      } else if (typeof body.transformToWebStream === "function") {
        console.log(`[PipeDiag] Using Readable.fromWeb(transformToWebStream()).pipe(res)`);
        const nodeStream = Readable.fromWeb(body.transformToWebStream() as any);
        nodeStream.pipe(res);
      } else {
        console.log(`[PipeDiag] Fallback to transformToByteArray`);
        const bytes = await body.transformToByteArray();
        res.end(Buffer.from(bytes));
      }

      res.on("finish", () => console.log(`[PipeDiag] Response finished in ${Date.now() - t0}ms`));
      res.on("close", () => console.log(`[PipeDiag] Response closed in ${Date.now() - t0}ms`));
    } catch (err: any) {
      console.error(`[PipeDiag] Error: ${err?.message}`);
      if (!res.headersSent) res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/video/:key(*)", async (req: Request, res: Response) => {
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: "Missing key" });
    console.log(`[VideoProxy] Request: ${key}, Range: ${req.headers.range || "none"}`);

    // Check local storage first
    const localPath = getLocalFilePath(key);
    if (localPath) {
      return res.sendFile(localPath);
    }

    try {
      const t0 = Date.now();
      const client = getS3Client();
      const bucket = ENV.railwayStorageBucket;
      console.log(`[VideoProxy] Using bucket=${bucket}, endpoint=${ENV.railwayStorageEndpoint}`);
      const rangeHeader = req.headers.range;

      // ── RANGE request: need total size up front for Content-Range header ──
      if (rangeHeader) {
        // Try cache first; only HeadObject on cache miss
        let cached = metadataCache.get(key);
        if (!cached || Date.now() >= cached.expiresAt) {
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          const size = head.ContentLength ?? 0;
          const ct = head.ContentType ?? "video/mp4";
          cacheMetadata(key, size, ct);
          cached = metadataCache.get(key)!;
        }
        const totalSize = cached.size;

        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        let start = 0;
        let end = totalSize - 1;
        if (match) {
          start = parseInt(match[1], 10);
          end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          if (start >= totalSize || end >= totalSize) {
            res.status(416).set("Content-Range", `bytes */${totalSize}`).end();
            return;
          }
        }

        const contentLength = end - start + 1;
        const s3Resp = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` })
        );

        res.status(206);
        res.removeHeader("Vary");
        res.set({
          "Content-Type": cached.contentType,
          "Content-Length": String(contentLength),
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400, immutable",
        });

        pipeS3Body(s3Resp.Body, res);
        return;
      }

      // ── NON-RANGE request: skip HeadObject, read size from GetObject response ──
      const s3Resp = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );

      const totalSize = s3Resp.ContentLength ?? 0;
      const contentType = s3Resp.ContentType ?? "video/mp4";

      // Warm the cache for future Range requests
      cacheMetadata(key, totalSize, contentType);

      res.status(200);
      res.removeHeader("Vary");
      res.set({
        "Content-Type": contentType,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400, immutable",
      });

      pipeS3Body(s3Resp.Body, res);
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
