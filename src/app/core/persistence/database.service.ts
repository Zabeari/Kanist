import { Injectable } from '@angular/core';
import Database from '@tauri-apps/plugin-sql';

const DB_PATH = 'sqlite:kanist.db';

export interface DatabaseClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    favorite        INTEGER NOT NULL DEFAULT 0,
    share_key       TEXT NOT NULL,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_state (
    project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    yjs_state   TEXT NOT NULL
  )`,
];

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;

  initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }
    return this.initPromise;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const db = await this.getDb();
    await db.execute(sql, params);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.getDb();
    return db.select<T[]>(sql, params);
  }

  async transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> {
    const db = await this.getDb();
    await db.execute('BEGIN');
    const tx: DatabaseClient = {
      execute: async (sql, params = []) => {
        await db.execute(sql, params);
      },
    };

    try {
      const result = await work(tx);
      await db.execute('COMMIT');
      return result;
    } catch (error) {
      await db.execute('ROLLBACK');
      throw error;
    }
  }

  private async doInitialize(): Promise<void> {
    this.db = await Database.load(DB_PATH);
    await this.db.execute('PRAGMA foreign_keys = ON');
    for (const sql of MIGRATIONS) {
      await this.db.execute(sql);
    }
  }

  private async getDb(): Promise<Database> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('Database failed to initialize');
    }
    return this.db;
  }
}
