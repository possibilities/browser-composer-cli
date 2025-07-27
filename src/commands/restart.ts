import { Command } from 'commander'
import fse from 'fs-extra'
import chalk from 'chalk'
const { readJsonSync, writeJsonSync } = fse
import {
  runContainer,
  stopContainer,
  ensureDockerImage,
} from '../utils/docker.js'
import { getSessionMetadataPath } from '../utils/paths.js'
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
  ProfileNotFoundError,
  DockerError,
  validateProfileName,
} from '../utils/errors.js'

export const restartCommand = new Command('restart')
  .description('Restart an existing browser profile')
  .option('-p, --profile <name>', 'Profile name to restart', 'default')
  .option('-d, --debug', 'Show debug output')
  .action(async options => {
    try {
      const sessionName = options.profile
      validateProfileName(sessionName)
      const containerName = `${CONTAINER_PREFIX}-${sessionName}`
      const metadataPath = getSessionMetadataPath(sessionName)

      let metadata: SessionConfig
      try {
        metadata = readJsonSync(metadataPath)
      } catch {
        throw new ProfileNotFoundError(sessionName)
      }

      console.log(chalk.yellow(`Stopping existing container if running...`))
      await stopContainer(containerName, options.debug)

      await ensureDockerImage(DOCKER_IMAGE_NAME, options.debug)

      metadata.lastUsed = new Date().toISOString()
      writeJsonSync(metadataPath, metadata, { spaces: 2 })

      console.log(chalk.green(`Restarting browser container: ${containerName}`))
      console.log(chalk.gray(`Profile: ${sessionName}`))
      console.log(chalk.gray(`Chrome profile: ${metadata.chromeUserDataPath}`))
      console.log(chalk.gray(`Recordings: ${metadata.recordingsPath}`))
      console.log()

      // Clean any stale Chrome lock files
      cleanChromeLockFiles(metadata.chromeUserDataPath)

      const { subprocess: dockerProcess, ports } = await runContainer(
        {
          containerName,
          imageName: DOCKER_IMAGE_NAME,
          sessionName,
          chromeUserDataDir: metadata.chromeUserDataPath,
          recordingsDir: metadata.recordingsPath,
          chromiumFlags: CHROMIUM_FLAGS_DEFAULT,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        },
        options.debug,
      )

      console.log(chalk.blue('Browser is available at:'))
      console.log(
        chalk.blue(`  - WebRTC: http://localhost:${ports.webrtcPort}`),
      )
      console.log(
        chalk.blue(`  - DevTools: http://localhost:${ports.devtoolsPort}`),
      )
      console.log(chalk.blue(`  - API: http://localhost:${ports.apiPort}`))
      console.log()

      try {
        await dockerProcess
      } catch (error) {
      } finally {
        process.exit(0)
      }
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        console.error(chalk.red(error.message))
        console.log(
          chalk.blue('Use "browser-composer list" to see available profiles'),
        )
      } else if (error instanceof DockerError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })
