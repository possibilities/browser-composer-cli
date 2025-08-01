import { execa, ExecaChildProcess } from 'execa'
import * as path from 'path'
import fse from 'fs-extra'
import * as os from 'os'
import chalk from 'chalk'
import { DockerRunOptions } from '../types.js'
import { allocatePorts, PortConfiguration } from './ports.js'
import { DockerError, toError } from './errors.js'
import {
  getSessionsDir,
  getTempBuildDir,
  getChromeProfileInitScript,
} from './paths.js'
import { CONTAINER_PREFIX } from './constants.js'
import { syncKernelImagesRepository } from './git.js'
const { writeFileSync, mkdtempSync, removeSync, readdirSync, statSync } = fse

export const imageExists = async (imageName: string): Promise<boolean> => {
  try {
    await execa('docker', ['image', 'inspect', imageName])
    return true
  } catch {
    return false
  }
}

export const buildImage = async (
  buildDir: string,
  imageName: string,
  debug: boolean = false,
) => {
  const scriptPath = path.join(
    buildDir,
    'images',
    'chromium-headful',
    'build-docker.sh',
  )

  console.log(
    chalk.blue('Running Docker build (this may take several minutes)...'),
  )

  await execa('bash', [scriptPath], {
    cwd: path.join(buildDir, 'images', 'chromium-headful'),
    env: {
      ...process.env,
      IMAGE: imageName,
    },
    stdio: debug ? 'inherit' : 'pipe',
  })
}

export interface RunContainerResult {
  subprocess: ExecaChildProcess | null
  ports: PortConfiguration
}

export const runContainer = async (
  options: DockerRunOptions,
  debug: boolean = false,
): Promise<RunContainerResult> => {
  const {
    containerName,
    imageName,
    chromeUserDataDir,
    recordingsDir,
    chromiumFlags,
    width,
    height,
    url,
    detached = false,
  } = options

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'browser-composer-'))
  const flagsFile = path.join(tmpDir, 'chromium-flags')
  const finalChromiumFlags = url ? `${chromiumFlags} ${url}` : chromiumFlags
  writeFileSync(flagsFile, finalChromiumFlags)

  const initScriptPath = getChromeProfileInitScript()

  const ports = await allocatePorts()

  const isInteractive = process.stdin.isTTY && !detached

  const runArgs = [
    'run',
    ...(detached ? ['-d'] : isInteractive ? ['-it'] : ['-i']),
    '--rm',
    '--name',
    containerName,
    '--privileged',
    '--tmpfs',
    '/dev/shm:size=2g',
    '-v',
    `${recordingsDir}:/recordings`,
    '-v',
    `${chromeUserDataDir}:/home/kernel/user-data`,
    '--memory',
    '8192m',
    '-p',
    `${ports.devtoolsPort}:9222`,
    '-p',
    `${ports.webrtcPort}:8080`,
    '-p',
    `${ports.apiPort}:10001`,
    '-e',
    `DISPLAY_NUM=1`,
    '-e',
    `HEIGHT=${height}`,
    '-e',
    `WIDTH=${width}`,
    '-e',
    `NEKO_DESKTOP_SCREEN=${width}x${height}@60`,
    '-e',
    'ENABLE_WEBRTC=true',
    '-e',
    'WITH_KERNEL_IMAGES_API=true',
    '-e',
    `NEKO_WEBRTC_EPR=${ports.udpRangeStart}-${ports.udpRangeEnd}`,
    '-e',
    'NEKO_WEBRTC_NAT1TO1=127.0.0.1',
    '-p',
    `${ports.udpRangeStart}-${ports.udpRangeEnd}:${ports.udpRangeStart}-${ports.udpRangeEnd}/udp`,
    '--mount',
    `type=bind,src=${flagsFile},dst=/chromium/flags,ro`,
    '--mount',
    `type=bind,src=${initScriptPath},dst=/browser-composer-init.sh,ro`,
    '--entrypoint',
    '/browser-composer-init.sh',
    imageName,
  ]

  await stopContainer(containerName, false)

  if (detached) {
    try {
      await execa('docker', runArgs, {
        stdio: debug ? 'inherit' : 'pipe',
      })
      removeSync(tmpDir)
      return { subprocess: null, ports }
    } catch (error) {
      removeSync(tmpDir)
      throw error
    }
  } else {
    const subprocess = execa('docker', runArgs, {
      stdio: debug ? 'inherit' : ['inherit', 'ignore', 'ignore'],
      cleanup: false,
    })

    const forwardSignalToDocker = (signal: NodeJS.Signals) => {
      subprocess.kill(signal)
    }

    process.on('SIGINT', forwardSignalToDocker)
    process.on('SIGTERM', forwardSignalToDocker)
    process.on('SIGHUP', forwardSignalToDocker)

    subprocess.on('exit', () => {
      process.removeListener('SIGINT', forwardSignalToDocker)
      process.removeListener('SIGTERM', forwardSignalToDocker)
      process.removeListener('SIGHUP', forwardSignalToDocker)
      removeSync(tmpDir)
    })

    return { subprocess, ports }
  }
}

export const stopContainer = async (
  containerName: string,
  debug: boolean = false,
) => {
  try {
    await execa('docker', ['rm', '-f', containerName], {
      stdio: debug ? 'inherit' : 'pipe',
    })
  } catch {}
}

export const containerIsRunning = async (
  containerName: string,
): Promise<boolean> => {
  try {
    const { stdout } = await execa('docker', ['ps', '--format', '{{.Names}}'])
    return stdout.split('\n').includes(containerName)
  } catch {
    return false
  }
}

export const checkDockerAvailable = async (): Promise<void> => {
  try {
    await execa('docker', ['version'], { timeout: 5000 })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new DockerError(
        'Docker is not installed. Please install Docker from https://docs.docker.com/get-docker/',
      )
    }

    try {
      await execa('docker', ['ps'], { timeout: 5000 })
    } catch {
      throw new DockerError(
        'Docker daemon is not running. Please start Docker and try again.',
      )
    }

    throw new DockerError('Failed to connect to Docker', error)
  }
}

export const cleanupOrphanedContainers = async (): Promise<void> => {
  try {
    const profilesDir = getSessionsDir()
    const existingProfiles = readdirSync(profilesDir).filter(name =>
      statSync(path.join(profilesDir, name)).isDirectory(),
    )

    const { stdout } = await execa('docker', [
      'ps',
      '-a',
      '--format',
      '{{.Names}}',
    ])
    const allContainers = stdout.split('\n').filter(Boolean)
    const ourContainers = allContainers.filter(name =>
      name.startsWith(CONTAINER_PREFIX),
    )

    for (const containerName of ourContainers) {
      const profileName = containerName.replace(`${CONTAINER_PREFIX}-`, '')

      if (!existingProfiles.includes(profileName)) {
        console.log(
          chalk.yellow(`Removing orphaned container: ${containerName}`),
        )
        await stopContainer(containerName, false)
      }
    }
  } catch (error) {
    console.warn(
      chalk.yellow('Warning: Could not clean up orphaned containers'),
      error,
    )
  }
}

export const ensureDockerImage = async (
  imageName: string,
  debug: boolean = false,
  forceRebuild: boolean = false,
): Promise<void> => {
  if (forceRebuild || !(await imageExists(imageName))) {
    if (forceRebuild && (await imageExists(imageName))) {
      console.log(chalk.yellow('Removing existing Docker image...'))
      try {
        await execa('docker', ['rmi', imageName])
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not remove existing image'))
      }
    }

    console.log(chalk.yellow('Building Docker image...'))
    const buildDir = getTempBuildDir()

    try {
      await syncKernelImagesRepository(buildDir, debug, forceRebuild)
      await buildImage(buildDir, imageName, debug)
      console.log(chalk.green('Successfully built Docker image'))
    } catch (error) {
      throw new DockerError(
        `Failed to build Docker image: ${error}`,
        toError(error),
      )
    }
  }
}
