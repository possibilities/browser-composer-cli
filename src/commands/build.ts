import { Command } from 'commander'
import chalk from 'chalk'
import { imageExists, buildImage } from '../utils/docker.js'
import { getTempBuildDir } from '../utils/paths.js'
import { cloneOrUpdateRepo } from '../utils/git.js'
import { DOCKER_IMAGE_NAME } from '../utils/constants.js'
import { DockerError, toError } from '../utils/errors.js'

export const buildCommand = new Command('build')
  .description('Build the browser Docker image')
  .option('-d, --debug', 'Show debug output')
  .action(async options => {
    try {
      if (await imageExists(DOCKER_IMAGE_NAME)) {
        console.log(chalk.yellow(`Image ${DOCKER_IMAGE_NAME} already exists`))
        console.log(chalk.blue('Rebuilding...'))
      }

      console.log(chalk.green('Building browser Docker image...'))
      const buildDir = getTempBuildDir()

      try {
        await cloneOrUpdateRepo(buildDir, options.debug)
        await buildImage(buildDir, DOCKER_IMAGE_NAME, options.debug)
        console.log(chalk.green(`✓ Successfully built ${DOCKER_IMAGE_NAME}`))
      } catch (error) {
        throw new DockerError(
          `Failed to build Docker image: ${error}`,
          toError(error),
        )
      }
    } catch (error) {
      if (error instanceof DockerError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })
