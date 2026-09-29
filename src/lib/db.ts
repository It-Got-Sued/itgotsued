import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Return DATE columns as "YYYY-MM-DD" strings instead of local-midnight Date objects.
types.setTypeParser(1082, (v) => v);
// Return BIGINT as number (settlement cents and counts fit well within 2^53).
types.setTypeParser(20, (v) => Number(v));

// Neon Postgres. The app uses the pooled DATABASE_URL; migrations use the direct
// (unpooled) connection because they need session features.

function connectionString(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set. Add the Neon connection string to .env.local.");
  // pg treats sslmode=require as verify-full already; say so explicitly to silence its warning.
  return url.replace(/sslmode=require\b/, "sslmode=verify-full");
}

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    globalForDb.__pgPool = new Pool({
      connectionString: connectionString(process.env.DATABASE_URL),
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForDb.__pgPool;
}

export function directConnectionString(): string {
  return connectionString(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run `fn` inside a transaction on one pooled connection. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await globalForDb.__pgPool?.end();
  globalForDb.__pgPool = undefined;
}
