import { Command } from 'commander'
import fse from 'fs-extra'
import chalk from 'chalk'
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
} from '../utils/errors.js'

export const startCommand = new Command('start')
  .description('Start or attach to a browser container')
  .option('-p, --profile <name>', 'Profile name for persistent browser data')
  .option('-d, --debug', 'Show debug output')
  .action(async options => {
    try {
      const sessionName = options.profile || 'default'
      validateProfileName(sessionName)
      const containerName = `${CONTAINER_PREFIX}-${sessionName}`

      const isRunning = await containerIsRunning(containerName)

      if (isRunning) {
        console.log(
          chalk.green(`Attaching to running container: ${containerName}`),
        )

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

          displayPortInfo(ports)
        } catch (error) {
          console.log(chalk.yellow('Could not retrieve port information'))
        }

        const attachProcess = execa('docker', ['attach', containerName], {
          stdio: 'inherit',
          cleanup: false,
        })

        try {
          await attachProcess
        } catch (error) {
        } finally {
          process.exit(0)
        }
        return
      }

      await ensureDockerImage(DOCKER_IMAGE_NAME, options.debug)

      const chromeUserDataDir = getChromeUserDataDir(sessionName)
      const recordingsDir = getRecordingsDir(sessionName)
      const metadataPath = getSessionMetadataPath(sessionName)

      let metadata: SessionConfig
      try {
        metadata = readJsonSync(metadataPath)
        metadata.lastUsed = new Date().toISOString()
      } catch {
        metadata = {
          name: sessionName,
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          chromeUserDataPath: chromeUserDataDir,
          recordingsPath: recordingsDir,
        }
      }
      writeJsonSync(metadataPath, metadata, { spaces: 2 })

      console.log(chalk.green(`Starting browser container: ${containerName}`))
      console.log(chalk.gray(`Profile: ${sessionName}`))
      console.log(chalk.gray(`Chrome profile: ${chromeUserDataDir}`))
      console.log(chalk.gray(`Recordings: ${recordingsDir}`))
      console.log()

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
        },
        options.debug,
      )

      displayPortInfo(ports)

      try {
        await dockerProcess
      } catch (error) {
      } finally {
        process.exit(0)
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
  console.log(chalk.blue(`  - API: http://localhost:${ports.apiPort}`))
  console.log()
}
