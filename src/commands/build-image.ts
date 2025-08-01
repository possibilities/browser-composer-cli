import { Command } from 'commander'
import chalk from 'chalk'
import { checkDockerAvailable, ensureDockerImage } from '../utils/docker.js'
import { DOCKER_IMAGE_NAME } from '../utils/constants.js'
import { DockerError } from '../utils/errors.js'

export const buildImageCommand = new Command('build-image')
  .description('Build or rebuild the browser Docker image')
  .option('-f, --force', 'Force rebuild even if image exists')
  .option('-d, --debug', 'Show debug output')
  .action(async options => {
    try {
      await checkDockerAvailable()

      console.log(chalk.blue('Building browser Docker image...'))
      console.log(chalk.gray(`Image name: ${DOCKER_IMAGE_NAME}`))

      await ensureDockerImage(DOCKER_IMAGE_NAME, true, options.force)

      console.log(chalk.green('✓ Docker image built successfully'))
    } catch (error) {
      if (error instanceof DockerError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })
