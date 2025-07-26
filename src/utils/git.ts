import { execa } from 'execa'
import fse from 'fs-extra'
import * as path from 'path'
import { KERNEL_IMAGES_REPO } from './constants.js'
import { getLocalKernelImagesPath } from './paths.js'
const { existsSync, copySync } = fse

export const cloneOrUpdateRepo = async (
  targetDir: string,
  debug: boolean = false,
) => {
  const localKernelImages = getLocalKernelImagesPath()

  // If local kernel-images exists, copy from there to get local changes
  if (existsSync(localKernelImages)) {
    console.log('Copying from local kernel-images repository...')
    copySync(localKernelImages, targetDir, {
      filter: src => {
        // Skip .git directory and other build artifacts
        const relativePath = path.relative(localKernelImages, src)
        if (relativePath.includes('.git')) return false
        if (relativePath.includes('node_modules')) return false
        if (relativePath.includes('.tmp')) return false
        if (relativePath.includes('.rootfs')) return false
        if (relativePath.includes('recordings')) return false
        if (relativePath.includes('chrome-user-data')) return false
        return true
      },
    })
  } else {
    // Fall back to cloning from git
    const gitDir = path.join(targetDir, '.git')

    if (existsSync(gitDir)) {
      console.log('Updating existing repository...')
      await execa('git', ['pull'], {
        cwd: targetDir,
        stdio: debug ? 'inherit' : 'pipe',
      })
    } else {
      console.log('Cloning kernel-images repository...')
      await execa('git', ['clone', KERNEL_IMAGES_REPO, targetDir], {
        stdio: debug ? 'inherit' : 'pipe',
      })
    }
  }
}
