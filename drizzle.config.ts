import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// For Railway PostgreSQL, ensure we're using the right schema
if (!connectionString.includes("postgresql") && !connectionString.includes("postgres")) {
  console.warn("Warning: DATABASE_URL does not appear to be a PostgreSQL connection string");
}

export default defineConfig({
  schema: "./drizzle/schema-postgres.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
