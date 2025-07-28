import { Command } from 'commander'
import { startCommand } from './start.js'
import { listCommand } from './list.js'
import { stopCommand } from './stop.js'
import { removeCommand } from './remove.js'
import { consoleCommand } from './console.js'

export const browserCommand = new Command('browser').description(
  'Manage browser containers',
)

browserCommand.addCommand(startCommand)
browserCommand.addCommand(listCommand)
browserCommand.addCommand(stopCommand)
browserCommand.addCommand(removeCommand)
browserCommand.addCommand(consoleCommand)
