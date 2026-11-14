import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "postgres://standup:standup@localhost:5432/standup");
if (!url) throw new Error("DATABASE_URL is required in production");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
