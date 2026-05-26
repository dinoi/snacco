export const ENV = {
  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Auth
  cookieSecret: process.env.JWT_SECRET ?? "",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  // Railway Object Storage (uses AWS SDK variable names)
  railwayStorageEndpoint: process.env.AWS_ENDPOINT_URL ?? process.env.RAILWAY_STORAGE_ENDPOINT ?? "",
  railwayAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? process.env.RAILWAY_ACCESS_KEY_ID ?? "",
  railwaySecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? process.env.RAILWAY_SECRET_ACCESS_KEY ?? "",
  railwayStorageBucket: process.env.AWS_S3_BUCKET_NAME ?? process.env.RAILWAY_STORAGE_BUCKET ?? "snacco",
  railwayStoragePublicUrl: process.env.RAILWAY_STORAGE_PUBLIC_URL ?? "",

  // App
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT ?? "3000", 10),
};
