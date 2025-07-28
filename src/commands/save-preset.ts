import { Command } from 'commander'
import fse from 'fs-extra'
import chalk from 'chalk'
const { writeJsonSync, copySync, existsSync } = fse
import {
  getSessionDir,
  getChromeUserDataDir,
  getPresetDir,
  getPresetMetadataPath,
} from '../utils/paths.js'
import { PresetConfig } from '../types.js'
import {
  ValidationError,
  validateProfileName,
  validatePresetName,
} from '../utils/errors.js'
import * as path from 'path'

export const savePresetCommand = new Command('save-preset')
  .description('Save a browser profile as a reusable preset')
  .argument('<profile-name>', 'Name of the profile to save as preset')
  .argument('<preset-name>', 'Name for the preset')
  .option('-d, --description <text>', 'Description of the preset')
  .action(async (profileName: string, presetName: string, options) => {
    try {
      validateProfileName(profileName)
      validatePresetName(presetName)

      const sessionDir = getSessionDir(profileName)
      const metadataPath = path.join(sessionDir, 'metadata.json')

      if (!existsSync(metadataPath)) {
        throw new ValidationError(`Profile "${profileName}" does not exist`)
      }

      const presetDir = getPresetDir(presetName)
      const presetMetadataPath = getPresetMetadataPath(presetName)

      if (existsSync(presetMetadataPath)) {
        throw new ValidationError(`Preset "${presetName}" already exists`)
      }

      console.log(
        chalk.blue(
          `Saving profile "${profileName}" as preset "${presetName}"...`,
        ),
      )

      const sourceChromeDir = getChromeUserDataDir(profileName)
      const destChromeDir = path.join(presetDir, 'chrome-user-data')
      if (existsSync(sourceChromeDir)) {
        console.log(chalk.gray('Copying Chrome user data...'))
        copySync(sourceChromeDir, destChromeDir, { preserveTimestamps: true })
      }

      const presetConfig: PresetConfig = {
        name: presetName,
        description: options.description,
        createdAt: new Date().toISOString(),
        sourceProfile: profileName,
      }

      writeJsonSync(presetMetadataPath, presetConfig, { spaces: 2 })

      console.log(chalk.green(`✓ Preset "${presetName}" saved successfully`))
    } catch (error) {
      if (error instanceof ValidationError) {
        console.error(chalk.red(error.message))
      } else {
        console.error(chalk.red('Error:'), error)
      }
      process.exit(1)
    }
  })
