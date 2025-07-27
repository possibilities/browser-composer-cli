import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { consoleMessages } from './consoleSchema.js'
import { migrations } from './migrations.js'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'

export function createConsoleDatabase(dbPath: string): {
  db: BetterSQLite3Database<{ consoleMessages: typeof consoleMessages }>
  sqlite: Database.Database
} {
  const dbDir = dirname(dbPath)

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  let sqlite: Database.Database
  try {
    sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('busy_timeout = 5000')
  } catch (error: any) {
    if (
      error.code === 'SQLITE_IOERR_SHORT_READ' ||
      error.code === 'SQLITE_CORRUPT'
    ) {
      try {
        if (existsSync(dbPath)) {
          unlinkSync(dbPath)
        }
        if (existsSync(dbPath + '-wal')) {
          unlinkSync(dbPath + '-wal')
        }
        if (existsSync(dbPath + '-shm')) {
          unlinkSync(dbPath + '-shm')
        }
        sqlite = new Database(dbPath)
        sqlite.pragma('journal_mode = WAL')
        sqlite.pragma('busy_timeout = 5000')
      } catch (retryError) {
        throw new Error(`Failed to create console database: ${retryError}`)
      }
    } else {
      throw error
    }
  }

  const db = drizzle(sqlite, {
    schema: { consoleMessages },
  })

  return { db, sqlite }
}

export async function runMigrations(
  _db: BetterSQLite3Database<any>,
  sqlite: Database.Database,
) {
  // Create migrations table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER
    )
  `)

  // Apply migrations
  for (const migration of migrations) {
    const existingMigration = sqlite
      .prepare('SELECT 1 FROM __drizzle_migrations WHERE hash = ?')
      .get(migration.tag)

    if (!existingMigration) {
      sqlite.exec(migration.sql)
      sqlite
        .prepare(
          'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        )
        .run(migration.tag, Date.now())
    }
  }
}
