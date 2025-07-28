import { Command } from 'commander'
import chalk from 'chalk'
import packageJson from '../package.json' assert { type: 'json' }
import { startBrowserCommand } from './commands/start-browser.js'
import { listBrowsersCommand } from './commands/list-browsers.js'
import { stopBrowserCommand } from './commands/stop-browser.js'
import { removeBrowserCommand } from './commands/remove-browser.js'
import { showLogsCommand } from './commands/show-logs.js'
import { clearLogsCommand } from './commands/clear-logs.js'
import { takeScreenshotCommand } from './commands/take-screenshot.js'
import { savePresetCommand } from './commands/save-preset.js'
import { listPresetsCommand } from './commands/list-presets.js'
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
    .description('Browser Composer CLI')
    .version(packageJson.version)

  program.addCommand(startBrowserCommand)
  program.addCommand(listBrowsersCommand)
  program.addCommand(stopBrowserCommand)
  program.addCommand(removeBrowserCommand)
  program.addCommand(showLogsCommand)
  program.addCommand(clearLogsCommand)
  program.addCommand(takeScreenshotCommand)
  program.addCommand(savePresetCommand)
  program.addCommand(listPresetsCommand)

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
