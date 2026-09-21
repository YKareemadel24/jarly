import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  // Supabase is Postgres. Point DATABASE_URL at the project's *Shared Pooler*
  // URI: the direct connection is IPv6-only unless the project has the IPv4
  // add-on, which is the usual reason a local `db:push` cannot connect.
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: "require",
  },
});
