import { Command } from 'commander'
import fse from 'fs-extra'
import * as path from 'path'
import chalk from 'chalk'
import { execa } from 'execa'
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
            'Use "browser-composer browser start <profile>" to create a profile',
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

          if (isRunning) {
            try {
              const { stdout } = await execa('docker', ['port', containerName])
              const portMappings = stdout.split('\n').filter(Boolean)

              const extractPort = (mapping: string, defaultPort: string) =>
                mapping.match(/:([0-9]+)$/)?.[1] || defaultPort

              const webrtcPort = extractPort(
                portMappings.find(p => p.includes('8080/tcp')) || '',
                '8080',
              )
              const devtoolsPort = extractPort(
                portMappings.find(p => p.includes('9222/tcp')) || '',
                '9222',
              )
              const apiPort = extractPort(
                portMappings.find(p => p.includes('10001/tcp')) || '',
                '10001',
              )

              console.log(chalk.gray(`  Ports:`))
              console.log(chalk.gray(`    - WebRTC: localhost:${webrtcPort}`))
              console.log(
                chalk.gray(`    - DevTools: localhost:${devtoolsPort}`),
              )
              console.log(chalk.gray(`    - API: localhost:${apiPort}`))
            } catch {
              // If we can't get port info, just skip it
            }
          }

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
