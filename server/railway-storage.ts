// Railway Object Storage integration with fallback to local storage
// Uses S3-compatible API with Railway credentials, falls back to local file storage if S3 fails

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";
import fs from "fs";
import path from "path";
import os from "os";

let s3Client: S3Client | null = null;
const LOCAL_STORAGE_DIR = path.join(os.tmpdir(), "snacco-videos");

// Ensure local storage directory exists
function ensureLocalStorageDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: ENV.railwayStorageEndpoint,
      credentials: {
        accessKeyId: ENV.railwayAccessKeyId,
        secretAccessKey: ENV.railwaySecretAccessKey,
      },
    });
  }
  return s3Client;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(relKey);

  const buffer =
    typeof data === "string"
      ? Buffer.from(data)
      : data instanceof Uint8Array
        ? Buffer.from(data)
        : data;

  // Try S3 first if credentials are available
  if (ENV.railwayStorageEndpoint && ENV.railwayAccessKeyId && ENV.railwaySecretAccessKey) {
    try {
      const client = getS3Client();
      const command = new PutObjectCommand({
        Bucket: ENV.railwayStorageBucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await client.send(command);
      const url = `${ENV.railwayStoragePublicUrl}/${key}`;
      console.log("[Storage] Successfully uploaded to S3:", key);
      return { key, url };
    } catch (error) {
      console.error("[Storage] S3 upload failed, falling back to local storage:", error instanceof Error ? error.message : String(error));
      // Fall through to local storage
    }
  }

  // Fallback to local storage
  console.log("[Storage] Using local fallback storage for:", key);
  ensureLocalStorageDir();
  const localPath = path.join(LOCAL_STORAGE_DIR, key);
  const localDir = path.dirname(localPath);
  
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  fs.writeFileSync(localPath, buffer);
  
  // Return a local URL (this won't work in production, but good for testing)
  const url = `/api/storage/${key}`;
  console.log("[Storage] Saved locally at:", localPath);
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  // Check if file exists locally first
  const localPath = path.join(LOCAL_STORAGE_DIR, relKey);
  if (fs.existsSync(localPath)) {
    console.log("[Storage] Serving from local storage:", relKey);
    const url = `/api/storage/${relKey}`;
    return { key: relKey, url };
  }

  // Otherwise try S3
  const url = `${ENV.railwayStoragePublicUrl}/${relKey}`;
  return { key: relKey, url };
}

export async function storageGetSignedUrl(relKey: string, expiresIn: number = 3600): Promise<string> {
  // Check if file exists locally first
  const localPath = path.join(LOCAL_STORAGE_DIR, relKey);
  if (fs.existsSync(localPath)) {
    console.log("[Storage] Serving local file via signed URL:", relKey);
    return `/api/storage/${relKey}`;
  }

  // Otherwise try S3
  if (ENV.railwayStorageEndpoint && ENV.railwayAccessKeyId && ENV.railwaySecretAccessKey) {
    try {
      const client = getS3Client();
      const command = new GetObjectCommand({
        Bucket: ENV.railwayStorageBucket,
        Key: relKey,
      });

      const url = await getSignedUrl(client, command, { expiresIn });
      return url;
    } catch (error) {
      console.error("[Storage] Signed URL generation failed:", error);
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error("Storage not configured");
}

// Helper to serve local files
export function getLocalFilePath(key: string): string | null {
  const localPath = path.join(LOCAL_STORAGE_DIR, key);
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  return null;
}
