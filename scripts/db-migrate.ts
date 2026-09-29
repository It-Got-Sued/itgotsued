// Apply pending SQL migrations from db/migrations to Neon, in filename order.
//   npm run db:migrate
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { directConnectionString } from "@/lib/db";

const DIR = "db/migrations";

async function main() {
  const client = new Client({ connectionString: directConnectionString() });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
    );
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${file} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(ran ? `${ran} migration(s) applied` : "database is up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
