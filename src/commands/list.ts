import { Command } from 'commander'
import fse from 'fs-extra'
import * as path from 'path'
import chalk from 'chalk'
const { readdirSync, readJsonSync, statSync } = fse
import { getSessionsDir } from '../utils/paths.js'
import { containerIsRunning } from '../utils/docker.js'
import { CONTAINER_PREFIX } from '../utils/constants.js'
import { SessionConfig } from '../types.js'

export const listCommand = new Command('list')
  .description('List all browser profiles')
  .action(async () => {
    try {
      const sessionsDir = getSessionsDir()
      const sessions = readdirSync(sessionsDir).filter((name: string) => {
        const sessionPath = path.join(sessionsDir, name)
        return statSync(sessionPath).isDirectory()
      })

      if (sessions.length === 0) {
        console.log(chalk.yellow('No profiles found'))
        console.log(
          chalk.blue(
            'Use "browser-composer browser start --profile <name>" to create a profile',
          ),
        )
        return
      }

      console.log(chalk.bold('Browser Profiles:\n'))

      for (const sessionName of sessions) {
        const metadataPath = path.join(
          sessionsDir,
          sessionName,
          'metadata.json',
        )
        const containerName = `${CONTAINER_PREFIX}-${sessionName}`

        try {
          const metadata: SessionConfig = readJsonSync(metadataPath)
          const isRunning = await containerIsRunning(containerName)
          const status = isRunning
            ? chalk.green('● running')
            : chalk.gray('○ stopped')

          console.log(`${status} ${chalk.bold(sessionName)}`)
          console.log(
            chalk.gray(
              `  Created: ${new Date(metadata.createdAt).toLocaleString()}`,
            ),
          )
          console.log(
            chalk.gray(
              `  Last used: ${new Date(metadata.lastUsed).toLocaleString()}`,
            ),
          )
          console.log()
        } catch {
          console.log(
            `${chalk.gray('○ stopped')} ${chalk.bold(sessionName)} ${chalk.red('(corrupted metadata)')}\n`,
          )
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error)
      process.exit(1)
    }
  })
