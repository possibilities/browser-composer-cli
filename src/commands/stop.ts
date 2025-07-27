import { Command } from 'commander'
import chalk from 'chalk'
import { stopContainer, containerIsRunning } from '../utils/docker.js'
import { CONTAINER_PREFIX } from '../utils/constants.js'
import { execa } from 'execa'
import { ContainerError, validateProfileName } from '../utils/errors.js'

export const stopCommand = new Command('stop')
  .description('Stop running browser containers')
  .argument('[profile]', 'Profile name to stop')
  .option('-a, --all', 'Stop all running containers')
  .option('-d, --debug', 'Show debug output')
  .action(async (profile, options) => {
    try {
      if (options.all) {
        await stopAllContainers(options.debug)
      } else if (profile) {
        await stopSingleContainer(profile, options.debug)
      } else {
        console.error(
          chalk.red('Error: Either profile name or --all is required'),
        )
        console.log(
          chalk.blue('Usage: browser-composer browser stop <profile>'),
        )
        console.log(chalk.blue('       browser-composer browser stop --all'))
        process.exit(1)
      }
    } catch (error) {
      if (error instanceof ContainerError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })

async function stopSingleContainer(
  profileName: string,
  debug: boolean = false,
) {
  validateProfileName(profileName)
  const containerName = `${CONTAINER_PREFIX}-${profileName}`

  if (!(await containerIsRunning(containerName))) {
    console.log(chalk.yellow(`Container ${containerName} is not running`))
    console.log(
      chalk.blue('Use "browser-composer browser list" to see all profiles'),
    )
    return
  }

  console.log(chalk.yellow(`Stopping container: ${containerName}`))
  await stopContainer(containerName, debug)
  console.log(chalk.green(`✓ Successfully stopped ${containerName}`))
}

async function stopAllContainers(debug: boolean = false) {
  try {
    const { stdout } = await execa('docker', ['ps', '--format', '{{.Names}}'])
    const runningContainers = stdout.split('\n').filter(Boolean)
    const ourContainers = runningContainers.filter(name =>
      name.startsWith(CONTAINER_PREFIX),
    )

    if (ourContainers.length === 0) {
      console.log(chalk.yellow('No browser containers are currently running'))
      return
    }

    console.log(
      chalk.yellow(`Stopping ${ourContainers.length} container(s)...`),
    )

    for (const containerName of ourContainers) {
      console.log(chalk.gray(`  Stopping ${containerName}...`))
      await stopContainer(containerName, debug)
    }

    console.log(chalk.green(`✓ Successfully stopped all containers`))
  } catch (error) {
    throw new ContainerError('Failed to list running containers')
  }
}
