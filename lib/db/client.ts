import fs from "node:fs/promises";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { getConfig, isPostgresUrl } from "@/lib/config";
import {
  POSTGRES_MIGRATIONS,
  POSTGRES_SCHEMA,
  SQLITE_MIGRATIONS,
  SQLITE_SCHEMA,
} from "@/lib/db/schema";

export type DbRow = Record<string, unknown>;

export type QueryResult = {
  rows: DbRow[];
};

export type DatabaseClient = {
  query(sql: string, args?: unknown[]): Promise<QueryResult>;
};

class LibSqlDatabaseClient implements DatabaseClient {
  private client: Client;

  constructor(url: string) {
    this.client = createClient({ url });
  }

  async query(sql: string, args: unknown[] = []): Promise<QueryResult> {
    const result = await this.client.execute({ sql, args: args as never[] });
    return { rows: result.rows as DbRow[] };
  }
}

function toPostgresSql(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}

class NeonDatabaseClient implements DatabaseClient {
  private client: NeonQueryFunction<false, false>;

  constructor(url: string) {
    this.client = neon(url);
  }

  async query(sql: string, args: unknown[] = []): Promise<QueryResult> {
    const rows = await this.client.query(toPostgresSql(sql), args);
    return { rows: rows as DbRow[] };
  }
}

let db: DatabaseClient | null = null;
let schemaPromise: Promise<void> | null = null;

async function ensureLocalDirectory(databaseUrl: string): Promise<void> {
  if (!databaseUrl.startsWith("file:")) return;
  const filePath = databaseUrl.replace(/^file:/, "");
  if (!filePath || filePath === ":memory:") return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function getDatabase(): Promise<DatabaseClient> {
  if (db) return db;
  const config = getConfig();
  if (isPostgresUrl(config.databaseUrl)) {
    db = new NeonDatabaseClient(config.databaseUrl);
  } else {
    await ensureLocalDirectory(config.databaseUrl);
    db = new LibSqlDatabaseClient(config.databaseUrl);
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const config = getConfig();
      const client = await getDatabase();
      const statements = isPostgresUrl(config.databaseUrl)
        ? POSTGRES_SCHEMA
        : SQLITE_SCHEMA;
      for (const statement of statements) {
        await client.query(statement);
      }
      const migrations = isPostgresUrl(config.databaseUrl)
        ? POSTGRES_MIGRATIONS
        : SQLITE_MIGRATIONS;
      for (const statement of migrations) {
        await client.query(statement).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!/duplicate column|already exists/i.test(message)) throw error;
        });
      }
    })();
  }
  await schemaPromise;
}
