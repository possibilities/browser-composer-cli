import { execa } from 'execa'
import fse from 'fs-extra'
import { KERNEL_IMAGES_REPO } from './constants.js'
const { existsSync, removeSync } = fse

interface NodeError extends Error {
  code?: string
}

async function removeDirectoryWithPermissionFallback(
  targetDir: string,
): Promise<void> {
  try {
    removeSync(targetDir)
  } catch (error) {
    const nodeError = error as NodeError
    if (nodeError.code === 'EACCES') {
      console.log('Permission denied, trying with sudo...')
      try {
        await execa('sudo', ['rm', '-rf', targetDir])
      } catch (sudoError) {
        throw new Error(
          `Failed to remove directory ${targetDir}: ${nodeError.message}`,
        )
      }
    } else {
      throw error
    }
  }
}

export const syncKernelImagesRepository = async (
  targetDir: string,
  debug: boolean = false,
  forceRefresh: boolean = false,
) => {
  if (forceRefresh || !existsSync(targetDir)) {
    if (existsSync(targetDir)) {
      console.log('Removing existing kernel-images directory...')
      await removeDirectoryWithPermissionFallback(targetDir)
    }

    console.log('Cloning kernel-images repository from GitHub...')
    await execa('git', ['clone', KERNEL_IMAGES_REPO, targetDir], {
      stdio: debug ? 'inherit' : 'pipe',
    })
    console.log('✓ Repository cloned successfully')
  } else {
    console.log('Updating existing kernel-images repository...')
    try {
      await execa('git', ['pull'], {
        cwd: targetDir,
        stdio: debug ? 'inherit' : 'pipe',
      })
      console.log('✓ Repository updated successfully')
    } catch (error) {
      console.log('Pull failed, removing and recloning...')
      await removeDirectoryWithPermissionFallback(targetDir)
      await execa('git', ['clone', KERNEL_IMAGES_REPO, targetDir], {
        stdio: debug ? 'inherit' : 'pipe',
      })
      console.log('✓ Repository cloned successfully')
    }
  }
}
