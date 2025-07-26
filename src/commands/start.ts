import { Command } from 'commander'
import fse from 'fs-extra'
import chalk from 'chalk'
const { writeJsonSync, readJsonSync } = fse
import {
  runContainer,
  containerIsRunning,
  ensureDockerImage,
} from '../utils/docker.js'
import {
  getChromeUserDataDir,
  getRecordingsDir,
  getSessionMetadataPath,
} from '../utils/paths.js'
import { setupGracefulShutdown } from '../utils/process.js'
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
  .description('Start a new browser container')
  .option('-p, --profile <name>', 'Profile name for persistent browser data')
  .action(async options => {
    try {
      const sessionName = options.profile || 'default'
      validateProfileName(sessionName)
      const containerName = `${CONTAINER_PREFIX}-${sessionName}`

      if (await containerIsRunning(containerName)) {
        console.log(
          chalk.yellow(`Container ${containerName} is already running`),
        )
        console.log(chalk.blue('Use "browser-composer restart" to restart it'))
        process.exit(1)
      }

      await ensureDockerImage(DOCKER_IMAGE_NAME)

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

      // Clean any stale Chrome lock files
      cleanChromeLockFiles(chromeUserDataDir)

      const { subprocess: dockerProcess, ports } = await runContainer({
        containerName,
        imageName: DOCKER_IMAGE_NAME,
        sessionName,
        chromeUserDataDir,
        recordingsDir,
        chromiumFlags: CHROMIUM_FLAGS_DEFAULT,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      })

      console.log(chalk.blue('Browser is available at:'))
      console.log(
        chalk.blue(`  - WebRTC: http://localhost:${ports.webrtcPort}`),
      )
      console.log(
        chalk.blue(`  - DevTools: http://localhost:${ports.devtoolsPort}`),
      )
      console.log(chalk.blue(`  - API: http://localhost:${ports.apiPort}`))
      console.log()

      setupGracefulShutdown(dockerProcess, containerName)

      try {
        await dockerProcess
      } catch (error) {}
    } catch (error) {
      if (error instanceof DockerError || error instanceof ValidationError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })
