import { Command } from 'commander'
import { logsCommand } from './console-logs.js'
import { clearCommand } from './console-clear.js'

export const consoleCommand = new Command('console').description(
  'Browser console utilities',
)

consoleCommand.addCommand(logsCommand)
consoleCommand.addCommand(clearCommand)
