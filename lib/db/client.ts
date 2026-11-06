import { Pool, type PoolClient } from "pg";

import { getConfig, hasLocalPersistenceConfig, isPostgresUrl } from "@/lib/config";
import { LOCAL_SCHEMA, LOCAL_TABLES, POSTGRES_SCHEMA, SCHEMA_VERSION } from "@/lib/db/schema";

export type DbRow = Record<string, unknown>;
export type QueryResult = { rows: DbRow[] };
export type DatabaseTransaction = { query(sql: string, args?: unknown[]): Promise<QueryResult> };
export type DatabaseClient = DatabaseTransaction & {
  transaction<T>(callback: (client: DatabaseTransaction) => Promise<T>): Promise<T>;
};

let pool: Pool | null = null;
let poolUrl: string | null = null;
let db: DatabaseClient | null = null;
let schemaPromise: Promise<void> | null = null;
let closingPromise: Promise<void> | null = null;

function localUrl(): string {
  if (process.env.VERCEL || !hasLocalPersistenceConfig()) {
    throw new Error("Local PostgreSQL persistence must be explicitly enabled outside hosted deployments.");
  }
  const value = getConfig().databaseUrl;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("A PostgreSQL DATABASE_URL is required for local persistence."); }
  if (!isPostgresUrl(value) || !parsed.hostname || parsed.pathname.length < 2) {
    throw new Error("A PostgreSQL DATABASE_URL is required for local persistence.");
  }
  return value;
}

function getPool(): Pool {
  const url = localUrl();
  if (closingPromise) throw new Error("The local database is closing.");
  if (pool) {
    if (poolUrl !== url) throw new Error("Close the local database before changing its configuration.");
    return pool;
  }
  poolUrl = url;
  pool = new Pool({
    connectionString: url,
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 15000,
    lock_timeout: 5000,
    application_name: "inspiration-canvas-local",
    options: "-c search_path=pg_catalog",
  });
  // pg removes a failed idle client; a later request must recheck initialization.
  pool.on("error", () => { schemaPromise = null; });
  return pool;
}

async function transaction<T>(callback: (client: DatabaseTransaction) => Promise<T>): Promise<T> {
  const selected = getPool(), selectedUrl = poolUrl;
  const client: PoolClient = await selected.connect();
  let failedRelease: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await callback({
      query: async (sql, args = []) => {
        if (localUrl() !== selectedUrl) throw new Error("The local database configuration changed during a transaction.");
        const value = await client.query(sql, args);
        return { rows: value.rows as DbRow[] };
      },
    });
    if (localUrl() !== selectedUrl) throw new Error("The local database configuration changed during a transaction.");
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { failedRelease = new Error("Local transaction rollback failed."); }
    throw error;
  } finally {
    client.release(failedRelease);
  }
}

export async function getDatabase(): Promise<DatabaseClient> {
  getPool();
  if (!db) db = {
    query: async (sql, args = []) => {
      const result = await getPool().query(sql, args);
      return { rows: result.rows as DbRow[] };
    },
    transaction,
  };
  return db;
}

export async function initializeDatabase(): Promise<void> {
  getPool();
  if (!schemaPromise) {
    const attempt = transaction(async (client) => {
      await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1, $2)", [1229144908, 1]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${LOCAL_SCHEMA}`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${LOCAL_SCHEMA}.schema_version (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
        version INTEGER NOT NULL
      )`);
      const current = await client.query(`SELECT version FROM ${LOCAL_SCHEMA}.schema_version WHERE singleton = TRUE FOR UPDATE`);
      if (current.rows.length) {
        if (current.rows.length !== 1 || Number(current.rows[0].version) !== SCHEMA_VERSION) {
          throw new Error("The local PostgreSQL schema version is unsupported.");
        }
        return;
      }
      const existing = await client.query(
        "SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = ANY($2::text[])",
        [LOCAL_SCHEMA, LOCAL_TABLES],
      );
      if (existing.rows.length) throw new Error("The local PostgreSQL schema contains unversioned tables; no existing data was converted.");
      for (const statement of POSTGRES_SCHEMA) await client.query(statement);
      await client.query(`INSERT INTO ${LOCAL_SCHEMA}.schema_version (singleton, version) VALUES (TRUE, $1)`, [SCHEMA_VERSION]);
    });
    schemaPromise = attempt;
    void attempt.catch(() => { if (schemaPromise === attempt) schemaPromise = null; });
  }
  await schemaPromise;
}

export function closeDatabase(): Promise<void> {
  if (closingPromise) return closingPromise;
  const current = pool;
  if (!current) return Promise.resolve();
  const initialization = schemaPromise;
  closingPromise = (async () => {
    try {
      if (initialization) await initialization.catch(() => undefined);
      await current.end();
    } finally {
      if (pool === current) { pool = null; poolUrl = null; db = null; schemaPromise = null; }
      closingPromise = null;
    }
  })();
  return closingPromise;
}
