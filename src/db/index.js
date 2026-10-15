import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

class DatabaseClient {
  constructor(dbPath = null) {
    const defaultPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'openforce.db');
    this.path = dbPath || defaultPath;
    
    // Ensure parent directory exists if not memory
    if (this.path !== ':memory:') {
      const dir = path.dirname(this.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.path);
    // Enable foreign keys and WAL mode for high performance & concurrency
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (this.path !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  all(sql, params = []) {
    return this.query(sql, params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.length > 0 ? rows[0] : null;
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  transaction(fn) {
    this.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn();
      this.exec('COMMIT;');
      return result;
    } catch (err) {
      this.exec('ROLLBACK;');
      throw err;
    }
  }

  checkpoint() {
    if (this.path !== ':memory:') {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (e) {
        // ignore if database is busy
      }
    }
  }

  close() {
    this.checkpoint();
    this.db.close();
  }
}

// Singleton for main application runtime
let instance = null;

export function getDb(customPath = null) {
  if (customPath) {
    return new DatabaseClient(customPath);
  }
  if (!instance) {
    instance = new DatabaseClient();
  }
  return instance;
}

export { DatabaseClient };
