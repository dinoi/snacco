// Storage helpers for Railway Object Storage (S3-compatible)
// Uses AWS SDK v3 to upload/download files from Railway's S3 bucket.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    const endpoint = ENV.railwayStorageEndpoint;
    const accessKeyId = ENV.railwayAccessKeyId;
    const secretAccessKey = ENV.railwaySecretAccessKey;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "Railway S3 config missing: set AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
      );
    }

    _s3 = new S3Client({
      endpoint,
      region: process.env.AWS_DEFAULT_REGION || "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // Required for Railway S3
    });
  }
  return _s3;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Upload file bytes to Railway S3 storage.
 * Returns { key, url } where url is the public URL or proxy path.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const s3 = getS3Client();
  const bucket = ENV.railwayStorageBucket;
  const key = appendHashSuffix(normalizeKey(relKey));

  const body =
    typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // If Railway provides a public URL, use it directly
  const publicUrl = ENV.railwayStoragePublicUrl;
  if (publicUrl) {
    const url = `${publicUrl.replace(/\/+$/, "")}/${key}`;
    return { key, url };
  }

  // Otherwise, use our proxy path
  return { key, url: `/manus-storage/${key}` };
}

/**
 * Get a URL for a stored file.
 * Uses public URL if available, otherwise proxy path.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const publicUrl = ENV.railwayStoragePublicUrl;

  if (publicUrl) {
    const url = `${publicUrl.replace(/\/+$/, "")}/${key}`;
    return { key, url };
  }

  return { key, url: `/manus-storage/${key}` };
}

/**
 * Get a presigned URL for a stored file (for private access).
 */
export async function storageGetSignedUrl(
  relKey: string,
  expiresIn = 3600
): Promise<string> {
  const s3 = getS3Client();
  const bucket = ENV.railwayStorageBucket;
  const key = normalizeKey(relKey);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
}
