import { describe, it, expect } from "vitest";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

describe("Video Proxy - Streaming Proxy", () => {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const bucket = process.env.AWS_S3_BUCKET_NAME!;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
  const testKey = "videos/1/demo/1780191267504_jacket_08057125.mp4";

  it("should connect to S3 with forcePathStyle and retrieve video metadata", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });

    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: testKey }));
    expect(head.ContentLength).toBeGreaterThan(0);
    expect(head.ContentType).toBe("video/mp4");
  });

  it("should stream video bytes via GetObject with Range support", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });

    const resp = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: testKey, Range: "bytes=0-1023" })
    );
    expect(resp.ContentLength).toBe(1024);
    expect(resp.ContentRange).toMatch(/^bytes 0-1023\/\d+$/);

    const bytes = await resp.Body!.transformToByteArray();
    expect(bytes.length).toBe(1024);
  });

  it("should return full file size from non-Range GetObject (skip HeadObject path)", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });

    // Non-Range GetObject should return ContentLength = total file size
    const resp = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: testKey })
    );
    expect(resp.ContentLength).toBeGreaterThan(0);
    expect(resp.ContentType).toBe("video/mp4");

    // Abort the stream to avoid downloading the whole file
    if (resp.Body && typeof (resp.Body as any).destroy === "function") {
      (resp.Body as any).destroy();
    }
  });
});
