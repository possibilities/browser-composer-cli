import { Command } from 'commander'
import fse from 'fs-extra'
import * as path from 'path'
import chalk from 'chalk'
const { readJsonSync, existsSync } = fse
import { getSessionsDir } from '../utils/paths.js'
import { containerIsRunning } from '../utils/docker.js'
import { CONTAINER_PREFIX } from '../utils/constants.js'
import { SessionConfig } from '../types.js'
import { getContainerPortMappings } from '../utils/portMapping.js'

export const showBrowserCommand = new Command('show-browser')
  .description('Show details for a specific browser profile')
  .argument('<name>', 'Browser profile name')
  .option('--json', 'Output as JSON')
  .action(async (name: string, options) => {
    try {
      const sessionsDir = getSessionsDir()
      const sessionPath = path.join(sessionsDir, name)

      if (!existsSync(sessionPath)) {
        if (options.json) {
          console.log(JSON.stringify({ error: `Profile "${name}" not found` }))
        } else {
          console.error(chalk.red(`Profile "${name}" not found`))
        }
        process.exit(1)
      }

      const metadataPath = path.join(sessionPath, 'metadata.json')
      if (!existsSync(metadataPath)) {
        if (options.json) {
          console.log(
            JSON.stringify({
              error: `Profile "${name}" has corrupted metadata`,
            }),
          )
        } else {
          console.error(chalk.red(`Profile "${name}" has corrupted metadata`))
        }
        process.exit(1)
      }

      const containerName = `${CONTAINER_PREFIX}-${name}`
      const metadata: SessionConfig = readJsonSync(metadataPath)
      const isRunning = await containerIsRunning(containerName)

      const profileData: any = {
        name,
        status: isRunning ? 'running' : 'stopped',
        createdAt: metadata.createdAt,
        lastUsed: metadata.lastUsed,
      }

      if (isRunning) {
        const ports = await getContainerPortMappings(containerName)
        if (ports) {
          profileData.ports = ports
        }
      }

      if (options.json) {
        console.log(JSON.stringify(profileData))
      } else {
        console.log(chalk.bold(`Browser Profile: ${name}\n`))

        const status = isRunning
          ? chalk.green('● running')
          : chalk.gray('○ stopped')

        console.log(`Status: ${status}`)
        console.log(`Created: ${new Date(metadata.createdAt).toLocaleString()}`)
        console.log(
          `Last used: ${new Date(metadata.lastUsed).toLocaleString()}`,
        )

        if (isRunning && profileData.ports) {
          console.log('\nPorts:')
          console.log(
            `  WebRTC: http://${profileData.ports.webrtc.host}:${profileData.ports.webrtc.port}`,
          )
          console.log(
            `  DevTools: http://${profileData.ports.devtools.host}:${profileData.ports.devtools.port}`,
          )
          console.log(
            `  API: http://${profileData.ports.api.host}:${profileData.ports.api.port}`,
          )
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      if (options.json) {
        console.log(JSON.stringify({ error: errorMessage }))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })
