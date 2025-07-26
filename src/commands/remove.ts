import { Command } from 'commander'
import chalk from 'chalk'
import fse from 'fs-extra'
import * as readline from 'readline'
import * as path from 'path'
const { existsSync, removeSync, readdirSync, statSync } = fse
import { stopContainer, containerIsRunning } from '../utils/docker.js'
import { getSessionDir, getSessionsDir } from '../utils/paths.js'
import { CONTAINER_PREFIX } from '../utils/constants.js'
import { ProfileNotFoundError, validateProfileName } from '../utils/errors.js'

export const removeCommand = new Command('remove')
  .description('Remove browser profiles and their data')
  .option('-p, --profile <name>', 'Profile name to remove')
  .option('-a, --all', 'Remove all browser profiles')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-d, --debug', 'Show debug output')
  .action(async options => {
    try {
      if (options.all) {
        await removeAllProfiles(options.force, options.debug)
      } else if (options.profile) {
        validateProfileName(options.profile)
        await removeProfile(options.profile, options.force, options.debug)
      } else {
        console.error(
          chalk.red('Error: Either --profile <name> or --all is required'),
        )
        console.log(
          chalk.blue('Usage: browser-composer remove --profile <name>'),
        )
        console.log(chalk.blue('       browser-composer remove --all'))
        console.log(
          chalk.blue('Use "browser-composer list" to see available profiles'),
        )
        process.exit(1)
      }
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

async function removeProfile(
  profileName: string,
  force: boolean = false,
  debug: boolean = false,
) {
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
    await stopContainer(containerName, debug)
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

async function removeAllProfiles(
  force: boolean = false,
  debug: boolean = false,
) {
  const sessionsDir = getSessionsDir()
  const profiles = readdirSync(sessionsDir).filter((name: string) => {
    const profilePath = path.join(sessionsDir, name)
    return statSync(profilePath).isDirectory()
  })

  if (profiles.length === 0) {
    console.log(chalk.yellow('No profiles found to remove'))
    return
  }

  console.log(chalk.yellow(`Found ${profiles.length} profile(s) to remove:`))
  profiles.forEach(profile => {
    console.log(chalk.gray(`  - ${profile}`))
  })

  if (!force) {
    const confirmed = await confirmAllRemoval(profiles.length)
    if (!confirmed) {
      console.log(chalk.yellow('Removal cancelled'))
      return
    }
  }

  console.log(chalk.yellow('\nRemoving all profiles...'))

  for (const profileName of profiles) {
    const containerName = `${CONTAINER_PREFIX}-${profileName}`

    if (await containerIsRunning(containerName)) {
      console.log(chalk.gray(`  Stopping container: ${containerName}`))
      await stopContainer(containerName, debug)
    }

    const sessionDir = getSessionDir(profileName)
    console.log(chalk.gray(`  Removing profile: ${profileName}`))

    try {
      removeSync(sessionDir)
    } catch (error) {
      console.error(chalk.red(`  Failed to remove ${profileName}: ${error}`))
    }
  }

  console.log(
    chalk.green(`✓ Successfully removed all ${profiles.length} profile(s)`),
  )
}

async function confirmAllRemoval(count: number): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    rl.question(
      chalk.yellow(
        `Are you sure you want to remove ALL ${count} profile(s)? This will delete all associated data. [y/N] `,
      ),
      answer => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      },
    )
  })
}
