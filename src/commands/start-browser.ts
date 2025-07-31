import { Command } from 'commander'
import fse from 'fs-extra'
import chalk from 'chalk'
import * as path from 'path'
const { writeJsonSync, readJsonSync } = fse
import {
  runContainer,
  containerIsRunning,
  ensureDockerImage,
} from '../utils/docker.js'
import { execa } from 'execa'
import {
  getChromeUserDataDir,
  getRecordingsDir,
  getSessionMetadataPath,
  getPresetDir,
} from '../utils/paths.js'
import {
  DOCKER_IMAGE_NAME,
  CONTAINER_PREFIX,
  CHROMIUM_FLAGS_DEFAULT,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} from '../utils/constants.js'
import { SessionConfig } from '../types.js'
import { cleanChromeLockFiles } from '../utils/chrome.js'
import {
  DockerError,
  ValidationError,
  validateProfileName,
  validatePresetExists,
} from '../utils/errors.js'
import {
  startConsoleLogging,
  ConsoleLoggerResult,
} from '../utils/consoleLogger.js'

export const startBrowserCommand = new Command('start-browser')
  .description('Start a browser container (runs in background by default)')
  .argument('<profile>', 'Profile name for persistent browser data')
  .argument('[url]', 'Optional URL to open in the browser')
  .option('-d, --debug', 'Show debug output')
  .option('--attach', 'Attach to the browser container (interactive mode)')
  .option(
    '--init-with-preset <name>',
    'Initialize new profile from preset (only applies on first run)',
  )
  .action(async (profile, url, options) => {
    try {
      const sessionName = profile
      validateProfileName(sessionName)
      const containerName = `${CONTAINER_PREFIX}-${sessionName}`

      let isRunning = await containerIsRunning(containerName)

      if (isRunning) {
        console.log(chalk.green(`Container already running: ${containerName}`))

        let devtoolsPort = '9222'
        try {
          const { stdout } = await execa('docker', ['port', containerName])
          const portMappings = stdout.split('\n').filter(Boolean)

          const extractPort = (mapping: string, defaultPort: string) =>
            mapping.match(/:([0-9]+)$/)?.[1] || defaultPort

          const ports = {
            webrtcPort: extractPort(
              portMappings.find(p => p.includes('8080/tcp')) || '',
              '8080',
            ),
            devtoolsPort: extractPort(
              portMappings.find(p => p.includes('9222/tcp')) || '',
              '9222',
            ),
            apiPort: extractPort(
              portMappings.find(p => p.includes('10001/tcp')) || '',
              '10001',
            ),
          }

          devtoolsPort = ports.devtoolsPort.toString()
          displayPortInfo(ports)
        } catch (error) {
          console.log(chalk.yellow('Could not retrieve port information'))
        }

        if (options.attach) {
          console.log(chalk.green(`Attaching to container...`))

          let consoleLogger: ConsoleLoggerResult | null = null
          try {
            consoleLogger = await startConsoleLogging(sessionName, devtoolsPort)
          } catch (error) {}

          const attachProcess = execa('docker', ['attach', containerName], {
            stdio: ['inherit', 'ignore', 'ignore'],
            cleanup: false,
          })

          const cleanup = async () => {
            if (consoleLogger) {
              await consoleLogger.cleanup()
            }
          }

          const forwardSignalToDocker = (signal: NodeJS.Signals) => {
            attachProcess.kill(signal)
          }

          process.on('SIGINT', forwardSignalToDocker)
          process.on('SIGTERM', forwardSignalToDocker)
          process.on('SIGHUP', forwardSignalToDocker)

          attachProcess.on('exit', async () => {
            process.removeListener('SIGINT', forwardSignalToDocker)
            process.removeListener('SIGTERM', forwardSignalToDocker)
            process.removeListener('SIGHUP', forwardSignalToDocker)
            await cleanup()
          })

          try {
            await attachProcess
            await cleanup()
            process.exit(0)
          } catch (error) {
            await cleanup()
            const containerStillRunning =
              await containerIsRunning(containerName)
            if (!containerStillRunning) {
              console.log(chalk.yellow('Container stopped, restarting...'))
              isRunning = false
            } else {
              process.exit(1)
            }
          }
        } else {
          await startConsoleLogging(sessionName, devtoolsPort).catch(() => {})

          console.log(
            chalk.green('Browser continues running in the background'),
          )
          console.log(
            chalk.gray(
              `To attach: browser-composer start-browser ${sessionName} --attach`,
            ),
          )
          process.exit(0)
        }
      }

      if (!isRunning) {
        await ensureDockerImage(DOCKER_IMAGE_NAME, options.debug)

        const chromeUserDataDir = getChromeUserDataDir(sessionName)
        const recordingsDir = getRecordingsDir(sessionName)
        const metadataPath = getSessionMetadataPath(sessionName)

        let metadata: SessionConfig
        let isNewProfile = false
        try {
          metadata = readJsonSync(metadataPath)
          metadata.lastUsed = new Date().toISOString()
        } catch {
          isNewProfile = true
          metadata = {
            name: sessionName,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            chromeUserDataPath: chromeUserDataDir,
            recordingsPath: recordingsDir,
          }

          if (options.initWithPreset && isNewProfile) {
            const presetName = options.initWithPreset
            validatePresetExists(presetName)

            const presetDir = getPresetDir(presetName)

            console.log(
              chalk.green(`Initializing profile from preset: ${presetName}`),
            )

            const presetChromeDir = path.join(presetDir, 'chrome-user-data')
            if (fse.existsSync(presetChromeDir)) {
              console.log(chalk.gray('Copying Chrome data from preset...'))
              fse.copySync(presetChromeDir, chromeUserDataDir, {
                preserveTimestamps: true,
              })
            }
          }
        }
        writeJsonSync(metadataPath, metadata, { spaces: 2 })

        console.log(chalk.green(`Starting browser container: ${containerName}`))
        console.log(chalk.gray(`Profile: ${sessionName}`))
        console.log(chalk.gray(`Chrome profile: ${chromeUserDataDir}`))
        console.log(chalk.gray(`Recordings: ${recordingsDir}`))

        cleanChromeLockFiles(chromeUserDataDir)

        const { subprocess: dockerProcess, ports } = await runContainer(
          {
            containerName,
            imageName: DOCKER_IMAGE_NAME,
            sessionName,
            chromeUserDataDir,
            recordingsDir,
            chromiumFlags: CHROMIUM_FLAGS_DEFAULT,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            url,
            detached: !options.attach,
          },
          options.debug,
        )

        displayPortInfo(ports)

        if (options.attach && dockerProcess) {
          let consoleLogger: ConsoleLoggerResult | null = null
          startConsoleLogging(sessionName, ports.devtoolsPort)
            .then(result => {
              consoleLogger = result
            })
            .catch(() => {})

          const cleanup = async () => {
            if (consoleLogger) {
              await consoleLogger.cleanup()
            }
          }

          // Handle cleanup on process exit
          const handleExit = async () => {
            await cleanup()
            process.exit(0)
          }

          process.on('SIGINT', handleExit)
          process.on('SIGTERM', handleExit)

          try {
            await dockerProcess
          } catch (error) {
            if (options.debug && error) {
              console.error(chalk.red('Docker process error:'), error)
            }
          } finally {
            await cleanup()
            process.exit(0)
          }
        } else {
          await startConsoleLogging(sessionName, ports.devtoolsPort).catch(
            () => {},
          )

          console.log(chalk.green('Browser started in the background'))
          console.log(
            chalk.gray(
              `To attach: browser-composer start-browser ${sessionName} --attach`,
            ),
          )
          process.exit(0)
        }
      }
    } catch (error) {
      if (error instanceof DockerError || error instanceof ValidationError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })

interface PortInfo {
  webrtcPort: string | number
  devtoolsPort: string | number
  apiPort: string | number
}

function displayPortInfo(ports: PortInfo) {
  console.log(chalk.blue('Browser is available at:'))
  console.log(chalk.blue(`  - WebRTC: http://localhost:${ports.webrtcPort}`))
  console.log(
    chalk.blue(`  - DevTools: http://localhost:${ports.devtoolsPort}`),
  )
  console.log(
    chalk.blue(`  - Screen Recording API: http://localhost:${ports.apiPort}`),
  )
}
