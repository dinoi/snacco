import { describe, it, expect } from "vitest";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe("Video Proxy - Presigned URL", () => {
  it("should generate a valid presigned URL for Railway S3", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: process.env.AWS_ENDPOINT_URL,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    const key = "videos/1/demo/1780191267504_jacket_08057125.mp4";

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 }
    );

    // URL should point to Railway S3 endpoint with path-style
    expect(url).toContain("t3.storageapi.dev");
    expect(url).toContain(bucket);
    expect(url).toContain("X-Amz-Signature");

    // Verify the presigned URL actually works by fetching a small range
    const resp = await fetch(url, {
      headers: { Range: "bytes=0-100" },
    });
    expect(resp.status).toBe(206);
    expect(resp.headers.get("content-type")).toBe("video/mp4");
  });
});
