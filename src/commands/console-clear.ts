import { Command } from 'commander'
import chalk from 'chalk'
import { consoleClearMarkers } from '../db/consoleSchema.js'
import { getConsoleDatabasePath, getSessionDir } from '../utils/paths.js'
import { validateProfileName } from '../utils/errors.js'
import { existsSync } from 'fs'
import { ulid } from 'ulid'
import { createConsoleDatabase, runMigrations } from '../db/database.js'

export const clearCommand = new Command('clear')
  .description(
    'Clear console log display (marks a point in time, does not delete logs)',
  )
  .argument('<profile>', 'Profile name')
  .action(async profile => {
    try {
      validateProfileName(profile)

      const sessionDir = getSessionDir(profile)
      if (!existsSync(sessionDir)) {
        console.error(chalk.red(`Profile "${profile}" does not exist`))
        process.exit(1)
      }

      const dbPath = getConsoleDatabasePath(profile)
      const { db, sqlite } = createConsoleDatabase(dbPath)

      await runMigrations(db, sqlite)

      const clearMarkerId = ulid()
      const clearedAt = new Date()

      await db.insert(consoleClearMarkers).values({
        id: clearMarkerId,
        profileName: profile,
        clearedAt,
      })

      console.log(
        chalk.green(`Console display cleared for profile "${profile}"`),
      )
      console.log(
        chalk.gray(
          `Use --include-scrollback with logs command to see all logs`,
        ),
      )

      sqlite.close()
    } catch (error) {
      console.error(chalk.red('Error:'), error)
      process.exit(1)
    }
  })
