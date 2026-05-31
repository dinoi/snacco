import { S3Client, PutObjectAclCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const endpoint = process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev";
const bucket = process.env.RAILWAY_STORAGE_BUCKET || "recorded-pantry-hcc-zp-t6";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const client = new S3Client({
  endpoint,
  region: "auto",
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

const testKey = "videos/1/demo/1780191267504_jacket_08057125.mp4";

async function tryPutAcl() {
  console.log("Trying PutObjectAcl with public-read...");
  try {
    await client.send(new PutObjectAclCommand({
      Bucket: bucket,
      Key: testKey,
      ACL: "public-read",
    }));
    console.log("PutObjectAcl succeeded!");
    return true;
  } catch (err) {
    console.log("PutObjectAcl failed:", err.message);
    return false;
  }
}

async function tryCopyWithAcl() {
  console.log("\nTrying CopyObject with public-read ACL...");
  try {
    await client.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: testKey,
      CopySource: `${bucket}/${testKey}`,
      ACL: "public-read",
      MetadataDirective: "COPY",
    }));
    console.log("CopyObject with ACL succeeded!");
    return true;
  } catch (err) {
    console.log("CopyObject with ACL failed:", err.message);
    return false;
  }
}

async function testDirectAccess() {
  // Try virtual-hosted style URL (as Railway recommends)
  const url = `https://${bucket}.${endpoint.replace("https://", "")}/${testKey}`;
  console.log(`\nTesting direct access: ${url}`);
  try {
    const resp = await fetch(url, { method: "HEAD" });
    console.log(`Status: ${resp.status}`);
    console.log(`Content-Type: ${resp.headers.get("content-type")}`);
    console.log(`Content-Length: ${resp.headers.get("content-length")}`);
    return resp.status === 200;
  } catch (err) {
    console.log("Direct access failed:", err.message);
    
    // Try path-style URL
    const pathUrl = `${endpoint}/${bucket}/${testKey}`;
    console.log(`\nTrying path-style: ${pathUrl}`);
    try {
      const resp2 = await fetch(pathUrl, { method: "HEAD" });
      console.log(`Status: ${resp2.status}`);
      return resp2.status === 200;
    } catch (err2) {
      console.log("Path-style also failed:", err2.message);
      return false;
    }
  }
}

async function main() {
  const aclWorked = await tryPutAcl();
  if (!aclWorked) {
    await tryCopyWithAcl();
  }
  
  // Test if the file is now publicly accessible
  await testDirectAccess();
}

main().catch(console.error);
