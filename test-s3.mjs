import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const endpoint = "https://t3.storageapi.dev";
const accessKeyId = "tid_XnYyfhFnjUb0zdRHXUwbmVUDFJoGhYHmPOBcrEd0fdbZvrjTqm";
const secretAccessKey = "tsec_m3RGfrzIq7d_G3gA7D2SzrRcBsh0SZPfLh8gjuL+9XWxdS8pwDrK9kY-Pb9vCWiRXdLWKI";
const bucket = "recorded-pantry-hcc-zp-t6";

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

try {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: "test/hello.txt",
    Body: Buffer.from("Hello, Railway Object Storage!"),
    ContentType: "text/plain",
  });
  
  const result = await client.send(command);
  console.log("✅ S3 upload successful:", result);
} catch (error) {
  console.error("❌ S3 upload failed:", error.message);
  console.error("Stack:", error.stack);
}
