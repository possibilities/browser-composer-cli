import { Command } from 'commander'
import fse from 'fs-extra'
import * as path from 'path'
import chalk from 'chalk'
const { readdirSync, readJsonSync, statSync } = fse
import { getPresetsDir } from '../utils/paths.js'
import { PresetConfig } from '../types.js'

export const listPresetsCommand = new Command('list-presets')
  .description('List all saved presets')
  .action(async () => {
    try {
      const presetsDir = getPresetsDir()
      const presets = readdirSync(presetsDir).filter((name: string) => {
        const presetPath = path.join(presetsDir, name)
        return statSync(presetPath).isDirectory()
      })

      if (presets.length === 0) {
        console.log(chalk.yellow('No presets found'))
        console.log(
          chalk.blue(
            'Use "browser-composer save-preset <profile-name> <preset-name>" to create a preset',
          ),
        )
        return
      }

      console.log(chalk.bold('Browser Presets:\n'))

      for (const presetName of presets) {
        const metadataPath = path.join(presetsDir, presetName, 'metadata.json')

        try {
          const metadata: PresetConfig = readJsonSync(metadataPath)

          console.log(chalk.bold(presetName))
          if (metadata.description) {
            console.log(chalk.gray(`  ${metadata.description}`))
          }
          console.log(
            chalk.gray(
              `  Created: ${new Date(metadata.createdAt).toLocaleString()}`,
            ),
          )
          console.log(chalk.gray(`  Source profile: ${metadata.sourceProfile}`))
          console.log()
        } catch {
          console.log(
            `${chalk.bold(presetName)} ${chalk.red('(corrupted metadata)')}\n`,
          )
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error)
      process.exit(1)
    }
  })
