// npm run db:reset: a fresh local database. Drops and recreates the public schema, runs the
// migrations, empties the local uploads (logos, product images) and runs the seed
// (`npm run db:reset -- --demo` runs the demo seed instead). Refuses to run in production or on a database whose name looks like a production one. Uses
// DATABASE_URL and UPLOADS_DIR from .env.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import pg from "pg";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UPLOAD_KINDS = ["logos", "products"];
const PRODUCTION_NAME = /prod|live/i;

const fail = (message: string): never => {
  console.error(`db:reset refused: ${message}`);
  process.exit(1);
};

const databaseName = (url: string | undefined) => {
  if (!url) return fail("DATABASE_URL is not set.");
  return decodeURIComponent(new URL(url).pathname.slice(1));
};

// Runs a node script from server/ with the same environment; stops on failure.
const run = (label: string, script: string, args: string[] = []) => {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], { cwd: SERVER_DIR, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`${label} failed.`);
    process.exit(result.status ?? 1);
  }
};

const main = async () => {
  if (process.env.NODE_ENV === "production") fail("NODE_ENV is production.");
  const name = databaseName(process.env.DATABASE_URL);
  if (PRODUCTION_NAME.test(name)) fail(`the database "${name}" looks like a production one.`);

  console.log(`▶ Recreating the schema of ${name}`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  const require = createRequire(import.meta.url);
  // The package's exports map has no entry for its CLI, so the path is built from its folder.
  const migrateCli = path.join(path.dirname(require.resolve("node-pg-migrate/package.json")), "bin/node-pg-migrate.js");
  run("Migrations", migrateCli, ["up"]);

  const uploadsDir = path.resolve(SERVER_DIR, process.env.UPLOADS_DIR || "uploads");
  console.log(`\n▶ Emptying ${uploadsDir}`);
  for (const kind of UPLOAD_KINDS) {
    const dir = path.join(uploadsDir, kind);
    if (!fs.existsSync(dir)) continue;
    // Dotfiles (uploads/logos/.gitkeep) stay.
    for (const file of fs.readdirSync(dir)) {
      if (!file.startsWith(".")) fs.rmSync(path.join(dir, file), { recursive: true, force: true });
    }
  }

  const demo = process.argv.includes("--demo");
  run(demo ? "Demo seed" : "Seed", path.join(SERVER_DIR, "dist/scripts", demo ? "seedDemo.js" : "seed.js"));
};

main().catch((error) => {
  console.error("db:reset failed:", error);
  process.exit(1);
});
