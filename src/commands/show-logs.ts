import { Command } from 'commander'
import chalk from 'chalk'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { consoleMessages, consoleClearMarkers } from '../db/consoleSchema.js'
import { getConsoleDatabasePath, getSessionDir } from '../utils/paths.js'
import { validateProfileName } from '../utils/errors.js'
import { existsSync } from 'fs'
import { desc, eq, gt, and, SQL } from 'drizzle-orm'

const POLL_INTERVAL_MS = 1000
const DEFAULT_LOG_LIMIT = 100

export const showLogsCommand = new Command('show-logs')
  .description('Show browser console logs')
  .argument('<profile>', 'Profile name')
  .option(
    '-l, --level <level>',
    'Filter by log level (log, warn, error, info, debug)',
  )
  .option(
    '-n, --limit <number>',
    'Number of log entries to show',
    DEFAULT_LOG_LIMIT.toString(),
  )
  .option('-f, --follow', 'Follow log output (like tail -f)')
  .option('-s, --include-scrollback', 'Include logs from before the last clear')
  .action(async (profile, options) => {
    try {
      validateProfileName(profile)

      const sessionDir = getSessionDir(profile)
      if (!existsSync(sessionDir)) {
        console.error(chalk.red(`Profile "${profile}" does not exist`))
        process.exit(1)
      }

      const dbPath = getConsoleDatabasePath(profile)
      if (!existsSync(dbPath)) {
        console.error(
          chalk.yellow(`No console logs found for profile "${profile}"`),
        )
        process.exit(0)
      }

      const sqlite = new Database(dbPath, { readonly: true })
      const db = drizzle(sqlite, {
        schema: { consoleMessages, consoleClearMarkers },
      })

      const formatLogEntry = (entry: typeof consoleMessages.$inferSelect) => {
        const date = new Date(entry.timestamp)
        const timestamp = date.toTimeString().split(' ')[0]
        const level = entry.level.toUpperCase().padEnd(5)

        return `${timestamp} ${level} ${entry.text}`
      }

      const buildWhereConditions = (
        clearMarkerTimestamp: Date | null,
        includeScrollback: boolean,
        level?: string,
      ): SQL[] => {
        const conditions: SQL[] = []
        if (clearMarkerTimestamp && !includeScrollback) {
          conditions.push(gt(consoleMessages.timestamp, clearMarkerTimestamp))
        }
        if (level) {
          conditions.push(eq(consoleMessages.level, level))
        }
        return conditions
      }

      let clearMarkerTimestamp: Date | null = null
      if (!options.includeScrollback) {
        const latestClearMarker = await db
          .select()
          .from(consoleClearMarkers)
          .where(eq(consoleClearMarkers.profileName, profile))
          .orderBy(desc(consoleClearMarkers.clearedAt))
          .limit(1)

        if (latestClearMarker.length > 0) {
          clearMarkerTimestamp = latestClearMarker[0].clearedAt
        }
      }

      if (options.follow) {
        let lastId: string | null = null

        const fetchNewLogs = async () => {
          const baseQuery = db
            .select()
            .from(consoleMessages)
            .orderBy(desc(consoleMessages.timestamp))
            .limit(parseInt(options.limit))

          const whereConditions = buildWhereConditions(
            clearMarkerTimestamp,
            options.includeScrollback,
            options.level,
          )

          const logs =
            whereConditions.length > 0
              ? await baseQuery.where(and(...whereConditions))
              : await baseQuery

          if (logs.length > 0 && logs[0].id !== lastId) {
            const newLogs = []
            for (const log of logs) {
              if (log.id === lastId) break
              newLogs.push(log)
            }

            newLogs.reverse().forEach(log => console.log(formatLogEntry(log)))

            lastId = logs[0].id
          }
        }

        await fetchNewLogs()

        const interval = setInterval(fetchNewLogs, POLL_INTERVAL_MS)

        process.on('SIGINT', () => {
          clearInterval(interval)
          sqlite.close()
          process.exit(0)
        })

        await new Promise(() => {})
      } else {
        const baseQuery = db
          .select()
          .from(consoleMessages)
          .orderBy(desc(consoleMessages.timestamp))
          .limit(parseInt(options.limit))

        const whereConditions = buildWhereConditions(
          clearMarkerTimestamp,
          options.includeScrollback,
          options.level,
        )

        const logs =
          whereConditions.length > 0
            ? await baseQuery.where(and(...whereConditions))
            : await baseQuery

        if (logs.length === 0) {
          console.log(
            chalk.yellow(
              options.level
                ? `No ${options.level} logs found`
                : 'No logs found',
            ),
          )
        } else {
          logs.reverse().forEach(log => console.log(formatLogEntry(log)))
        }

        sqlite.close()
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error)
      process.exit(1)
    }
  })
