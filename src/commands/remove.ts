import { Command } from 'commander'
import chalk from 'chalk'
import fse from 'fs-extra'
import * as readline from 'readline'
const { existsSync, removeSync } = fse
import { stopContainer, containerIsRunning } from '../utils/docker.js'
import { getSessionDir } from '../utils/paths.js'
import { CONTAINER_PREFIX } from '../utils/constants.js'
import { ProfileNotFoundError, validateProfileName } from '../utils/errors.js'

export const removeCommand = new Command('remove')
  .description('Remove browser profiles and their data')
  .option('-p, --profile <name>', 'Profile name to remove')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async options => {
    try {
      if (!options.profile) {
        console.error(chalk.red('Error: Profile name is required'))
        console.log(
          chalk.blue('Usage: browser-composer remove --profile <name>'),
        )
        console.log(
          chalk.blue('Use "browser-composer list" to see available profiles'),
        )
        process.exit(1)
      }

      validateProfileName(options.profile)
      await removeProfile(options.profile, options.force)
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        console.error(chalk.red(error.message))
        console.log(
          chalk.blue('Use "browser-composer list" to see available profiles'),
        )
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })

async function removeProfile(profileName: string, force: boolean = false) {
  const sessionDir = getSessionDir(profileName)

  if (!existsSync(sessionDir)) {
    throw new ProfileNotFoundError(profileName)
  }

  if (!force) {
    const confirmed = await confirmRemoval(profileName)
    if (!confirmed) {
      console.log(chalk.yellow('Removal cancelled'))
      return
    }
  }

  const containerName = `${CONTAINER_PREFIX}-${profileName}`

  if (await containerIsRunning(containerName)) {
    console.log(chalk.yellow(`Stopping container: ${containerName}`))
    await stopContainer(containerName)
  }

  console.log(chalk.yellow(`Removing profile: ${profileName}`))
  console.log(chalk.gray(`  Deleting: ${sessionDir}`))

  try {
    removeSync(sessionDir)
    console.log(chalk.green(`✓ Successfully removed profile "${profileName}"`))
  } catch (error) {
    console.error(chalk.red(`Failed to remove profile directory: ${error}`))
    throw error
  }
}

async function confirmRemoval(profileName: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    rl.question(
      chalk.yellow(
        `Are you sure you want to remove profile "${profileName}"? This will delete all associated data. [y/N] `,
      ),
      answer => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      },
    )
  })
}
