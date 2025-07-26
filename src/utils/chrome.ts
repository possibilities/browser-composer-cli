import fse from 'fs-extra'
import * as path from 'path'
const { removeSync, existsSync } = fse

export const cleanChromeLockFiles = (chromeUserDataDir: string) => {
  const lockFiles = [
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
    'Default/LOCK',
    '.org.chromium.Chromium.*',
  ]

  for (const lockFile of lockFiles) {
    if (lockFile.includes('*')) {
      try {
        const files = fse.readdirSync(chromeUserDataDir) as string[]
        const pattern = lockFile.replace('*', '')
        files.forEach(file => {
          if (file.startsWith(pattern)) {
            const filePath = path.join(chromeUserDataDir, file)
            removeSync(filePath)
            console.log(`Removed lock file: ${file}`)
          }
        })
      } catch (error) {}
    } else {
      const lockPath = path.join(chromeUserDataDir, lockFile)
      if (existsSync(lockPath)) {
        try {
          removeSync(lockPath)
          console.log(`Removed stale lock file: ${lockFile}`)
        } catch (error) {
          console.warn(`Failed to remove lock file ${lockFile}:`, error)
        }
      }
    }
  }

  const lastVersionPath = path.join(chromeUserDataDir, 'Last Version')
  try {
    removeSync(lastVersionPath)
    console.log('Removed Last Version file to force fresh start')
  } catch (error) {}
}
