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

export const listBrowsersCommand = new Command('list-browsers')
  .description('List all browser profiles')
  .option('--json', 'Output as JSON')
  .action(async options => {
    try {
      const sessionsDir = getSessionsDir()
      const sessions = readdirSync(sessionsDir).filter((name: string) => {
        const sessionPath = path.join(sessionsDir, name)
        return statSync(sessionPath).isDirectory()
      })

      if (sessions.length === 0) {
        if (options.json) {
          console.log('[]')
          return
        }
        console.log(chalk.yellow('No profiles found'))
        console.log(
          chalk.blue(
            'Use "browser-composer browser start <profile>" to create a profile',
          ),
        )
        return
      }

      if (!options.json) {
        console.log(chalk.bold('Browser Profiles:\n'))
      }

      const profilesData = []

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

          const profileData: any = {
            name: sessionName,
            status: isRunning ? 'running' : 'stopped',
            createdAt: metadata.createdAt,
            lastUsed: metadata.lastUsed,
          }

          if (isRunning) {
            try {
              const { stdout } = await execa('docker', ['port', containerName])
              const portMappings = stdout.split('\n').filter(Boolean)

              const extractPortInfo = (
                mapping: string,
                defaultPort: string,
              ) => {
                const match = mapping.match(/([0-9.]+):([0-9]+)$/)
                if (match) {
                  return {
                    host: match[1] === '0.0.0.0' ? 'localhost' : match[1],
                    port: match[2],
                  }
                }
                return { host: 'localhost', port: defaultPort }
              }

              const webrtcInfo = extractPortInfo(
                portMappings.find(p => p.includes('8080/tcp')) || '',
                '8080',
              )
              const devtoolsInfo = extractPortInfo(
                portMappings.find(p => p.includes('9222/tcp')) || '',
                '9222',
              )
              const apiInfo = extractPortInfo(
                portMappings.find(p => p.includes('10001/tcp')) || '',
                '10001',
              )

              profileData.ports = {
                webrtc: webrtcInfo,
                devtools: devtoolsInfo,
                api: apiInfo,
              }
            } catch {
              // If we can't get port info, just skip it
            }
          }

          profilesData.push(profileData)

          if (!options.json) {
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

            if (isRunning && profileData.ports) {
              console.log(chalk.gray(`  Ports:`))
              console.log(
                chalk.gray(
                  `    - WebRTC: ${profileData.ports.webrtc.host}:${profileData.ports.webrtc.port}`,
                ),
              )
              console.log(
                chalk.gray(
                  `    - DevTools: ${profileData.ports.devtools.host}:${profileData.ports.devtools.port}`,
                ),
              )
              console.log(
                chalk.gray(
                  `    - API: ${profileData.ports.api.host}:${profileData.ports.api.port}`,
                ),
              )
            }

            console.log()
          }
        } catch {
          const profileData = {
            name: sessionName,
            status: 'stopped',
            error: 'corrupted metadata',
          }
          profilesData.push(profileData)

          if (!options.json) {
            console.log(
              `${chalk.gray('○ stopped')} ${chalk.bold(sessionName)} ${chalk.red('(corrupted metadata)')}\n`,
            )
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify(profilesData))
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error)
      process.exit(1)
    }
  })
