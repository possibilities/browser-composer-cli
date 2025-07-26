import { Command } from 'commander'
import chalk from 'chalk'
import packageJson from '../package.json' assert { type: 'json' }
import { startCommand } from './commands/start.js'
import { restartCommand } from './commands/restart.js'
import { buildCommand } from './commands/build.js'
import { listCommand } from './commands/list.js'
import { stopCommand } from './commands/stop.js'
import { removeCommand } from './commands/remove.js'
import {
  checkDockerAvailable,
  cleanupOrphanedContainers,
} from './utils/docker.js'
import { DockerError } from './utils/errors.js'

async function main() {
  try {
    await checkDockerAvailable()
    await cleanupOrphanedContainers()
  } catch (error) {
    if (error instanceof DockerError) {
      console.error(chalk.red(error.message))
      process.exit(1)
    }
    throw error
  }

  const program = new Command()

  program
    .name('browser-composer')
    .description(
      'Browser Composer - Manage browser containers with persistent profiles',
    )
    .version(packageJson.version)

  program.addCommand(startCommand)
  program.addCommand(restartCommand)
  program.addCommand(buildCommand)
  program.addCommand(listCommand)
  program.addCommand(stopCommand)
  program.addCommand(removeCommand)

  try {
    program.exitOverride()
    program.configureOutput({
      writeErr: str => process.stderr.write(str),
    })

    await program.parseAsync(process.argv)
  } catch (error: any) {
    if (
      error.code === 'commander.help' ||
      error.code === 'commander.helpDisplayed' ||
      error.code === 'commander.version'
    ) {
      process.exit(0)
    }
    console.error('Error:', error.message || error)
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
