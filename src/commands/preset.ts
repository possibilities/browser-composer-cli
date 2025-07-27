import { Command } from 'commander'
import { presetSaveCommand } from './preset-save.js'
import { presetListCommand } from './preset-list.js'

export const presetCommand = new Command('preset').description(
  'Manage browser profile presets',
)

presetCommand.addCommand(presetSaveCommand.name('save'))
presetCommand.addCommand(presetListCommand.name('list'))
