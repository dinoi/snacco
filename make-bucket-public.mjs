import 'dotenv/config';
import { S3Client, PutBucketPolicyCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.RAILWAY_STORAGE_ENDPOINT || "https://t3.storageapi.dev",
  credentials: {
    accessKeyId: process.env.RAILWAY_STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.RAILWAY_STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  },
  // Tigris recommends virtual-hosted style, but let's try both if needed
  forcePathStyle: false,
});

const bucket = process.env.RAILWAY_STORAGE_BUCKET || process.env.AWS_S3_BUCKET_NAME;

const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicReadGetObject",
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucket}/*`]
    }
  ]
};

async function makePublic() {
  console.log(`Setting public policy for bucket: ${bucket}`);
  try {
    await client.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy)
    }));
    console.log("Success! Bucket is now public.");
    console.log(`Test URL: https://${bucket}.t3.storageapi.dev/videos/1/demo/1780191267504_jacket_08057125.mp4`);
  } catch (err) {
    console.error("Failed to set policy:", err.message);
    
    // Try with forcePathStyle if virtual-hosted failed
    console.log("Retrying with forcePathStyle: true...");
    const client2 = new S3Client({
      region: "auto",
      endpoint: process.env.RAILWAY_STORAGE_ENDPOINT || "https://t3.storageapi.dev",
      credentials: {
        accessKeyId: process.env.RAILWAY_STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.RAILWAY_STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
    
    try {
      await client2.send(new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify(policy)
      }));
      console.log("Success with forcePathStyle! Bucket is now public.");
    } catch (err2) {
      console.error("Failed again:", err2.message);
    }
  }
}

makePublic();
