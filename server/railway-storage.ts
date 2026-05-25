// Railway Object Storage integration
// Uses S3-compatible API with Railway credentials

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let s3Client: S3Client | null = null;

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
  const client = getS3Client();
  const key = appendHashSuffix(relKey);

  const buffer =
    typeof data === "string"
      ? Buffer.from(data)
      : data instanceof Uint8Array
        ? Buffer.from(data)
        : data;

  const command = new PutObjectCommand({
    Bucket: ENV.railwayStorageBucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  try {
    await client.send(command);
    const url = `${ENV.railwayStoragePublicUrl}/${key}`;
    return { key, url };
  } catch (error) {
    console.error("[Storage] PUT failed:", error);
    throw new Error(`Storage upload failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const url = `${ENV.railwayStoragePublicUrl}/${relKey}`;
  return { key: relKey, url };
}

export async function storageGetSignedUrl(relKey: string, expiresIn: number = 3600): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: ENV.railwayStorageBucket,
    Key: relKey,
  });

  try {
    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error("[Storage] Signed URL generation failed:", error);
    throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}
