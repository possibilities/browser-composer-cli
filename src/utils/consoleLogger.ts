import CDP from 'chrome-remote-interface'
import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import { consoleMigrations } from '../db/consoleMigrations.js'
import { getConsoleDatabasePath } from './paths.js'

export interface ConsoleLoggerResult {
  cleanup: () => Promise<void>
}

export async function startConsoleLogging(
  profileName: string,
  devtoolsPort: string | number,
): Promise<ConsoleLoggerResult> {
  const dbPath = getConsoleDatabasePath(profileName)
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
    // If database is corrupted, delete it and try again
    if (
      error.code === 'SQLITE_IOERR_SHORT_READ' ||
      error.code === 'SQLITE_CORRUPT'
    ) {
      // Silently handle corrupted database
      try {
        if (existsSync(dbPath)) {
          unlinkSync(dbPath)
        }
        // Also remove WAL and SHM files if they exist
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

  // Initialize database if needed
  if (
    !existsSync(dbPath) ||
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='console_messages'",
      )
      .get() === undefined
  ) {
    const createMigrationsTable = `
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER
      )
    `
    sqlite.prepare(createMigrationsTable).run()

    for (const [tag, sql] of Object.entries(consoleMigrations.migrations)) {
      const hash = tag
      const existing = sqlite
        .prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?')
        .get(hash)

      if (!existing) {
        sqlite.exec(sql)
        sqlite
          .prepare(
            'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
          )
          .run(hash, Date.now())
      }
    }
  }

  let cdpClient: any
  let retryCount = 0
  const maxRetries = 10
  const retryDelay = 1000

  // Retry connection to Chrome DevTools
  while (retryCount < maxRetries) {
    try {
      cdpClient = await CDP({ port: parseInt(devtoolsPort.toString()) })
      break
    } catch (error) {
      retryCount++
      if (retryCount === maxRetries) {
        sqlite.close()
        throw new Error(
          `Failed to connect to Chrome DevTools after ${maxRetries} attempts`,
        )
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }
  }

  const { Runtime, Console, Page } = cdpClient

  // Track current page URL
  let currentPageUrl: string | null = null

  // Enable Page domain to track navigation
  await Page.enable()

  // Get initial URL
  try {
    const { frameTree } = await Page.getFrameTree()
    currentPageUrl = frameTree.frame.url || null
  } catch (error) {
    // Ignore errors getting initial URL
  }

  // Update URL on navigation
  Page.frameNavigated(({ frame }: any) => {
    if (frame.parentId === undefined) {
      // Main frame only
      currentPageUrl = frame.url || null
    }
  })

  // Enable console domains
  await Console.enable()
  Console.messageAdded(({ message }: any) => {
    const id = ulid()
    const timestamp = message.timestamp
      ? new Date(message.timestamp * 1000)
      : new Date()

    try {
      const stmt = sqlite.prepare(`
        INSERT INTO console_messages (id, timestamp, level, text, url, created)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        Math.floor(timestamp.getTime() / 1000),
        message.level,
        message.text,
        message.url || message.source || currentPageUrl,
        Math.floor(Date.now() / 1000),
      )
    } catch (error: any) {
      // Silently ignore errors to not interfere with browser operation
    }
  })

  await Runtime.enable()
  Runtime.consoleAPICalled(({ type, args, stackTrace }: any) => {
    const id = ulid()
    const timestamp = new Date()

    const argsText = args
      .map((arg: any) => arg.value ?? arg.description ?? JSON.stringify(arg))
      .join(' ')

    try {
      // Also store console API calls in the console_messages table for unified querying
      const stmt = sqlite.prepare(`
        INSERT INTO console_messages (id, timestamp, level, text, url, created)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      // Extract URL from stack trace if available
      let url = null

      if (
        stackTrace &&
        stackTrace.callFrames &&
        stackTrace.callFrames.length > 0
      ) {
        const topFrame = stackTrace.callFrames[0]
        url = topFrame.url || null
      }

      stmt.run(
        id,
        Math.floor(timestamp.getTime() / 1000),
        type, // Use console method type as level (log, error, warn, etc.)
        argsText,
        url || currentPageUrl,
        Math.floor(Date.now() / 1000),
      )
    } catch (error: any) {
      // Silently ignore errors to not interfere with browser operation
    }
  })

  // Cleanup function
  const cleanup = async () => {
    try {
      await cdpClient.close()
    } catch (error) {
      // Ignore errors during cleanup
    }
    sqlite.close()
  }

  return { cleanup }
}
