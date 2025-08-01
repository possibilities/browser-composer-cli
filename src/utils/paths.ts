import * as path from 'path'
import * as os from 'os'
import fse from 'fs-extra'
import { fileURLToPath } from 'url'
const { ensureDirSync } = fse

export const getAppDataDir = () => {
  const baseDir = path.join(os.homedir(), '.browser-composer')
  ensureDirSync(baseDir)
  return baseDir
}

export const getSessionsDir = () => {
  const sessionsDir = path.join(getAppDataDir(), 'profiles')
  ensureDirSync(sessionsDir)
  return sessionsDir
}

export const getSessionDir = (sessionName: string) => {
  const sessionDir = path.join(getSessionsDir(), sessionName)
  ensureDirSync(sessionDir)
  return sessionDir
}

export const getChromeUserDataDir = (sessionName: string) => {
  const userDataDir = path.join(getSessionDir(sessionName), 'chrome-user-data')
  ensureDirSync(userDataDir)
  return userDataDir
}

export const getRecordingsDir = (sessionName: string) => {
  const recordingsDir = path.join(getSessionDir(sessionName), 'recordings')
  ensureDirSync(recordingsDir)
  return recordingsDir
}

export const getSessionMetadataPath = (sessionName: string) => {
  return path.join(getSessionDir(sessionName), 'metadata.json')
}

export const getTempBuildDir = () => {
  const tempDir = path.join(os.tmpdir(), 'browser-composer-build')
  ensureDirSync(tempDir)
  return tempDir
}

export const getPresetsDir = () => {
  const presetsDir = path.join(getAppDataDir(), 'presets')
  ensureDirSync(presetsDir)
  return presetsDir
}

export const getPresetDir = (presetName: string) => {
  const presetDir = path.join(getPresetsDir(), presetName)
  ensureDirSync(presetDir)
  return presetDir
}

export const getPresetMetadataPath = (presetName: string) => {
  return path.join(getPresetDir(presetName), 'metadata.json')
}

export const getConsoleDatabasePath = (profileName: string) => {
  return path.join(getSessionDir(profileName), 'console.db')
}

export const getScreenshotsDir = (sessionName: string) => {
  const screenshotsDir = path.join(getSessionDir(sessionName), 'screenshots')
  ensureDirSync(screenshotsDir)
  return screenshotsDir
}

export const getChromeProfileInitScript = () => {
  const currentFileUrl = import.meta.url
  const currentFilePath = fileURLToPath(currentFileUrl)
  const currentDir = path.dirname(currentFilePath)

  return path.join(currentDir, 'scripts', 'chrome-profile-init.sh')
}
