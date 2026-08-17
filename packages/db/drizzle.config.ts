import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // A relative path (not path.join + __dirname) so this resolves correctly
  // on Windows too — drizzle-kit's internal glob matching expects forward
  // slashes, and path.join produces backslashes on Windows.
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
