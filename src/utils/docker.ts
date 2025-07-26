import { execa, ExecaChildProcess } from 'execa'
import * as path from 'path'
import fse from 'fs-extra'
import * as os from 'os'
import chalk from 'chalk'
import { DockerRunOptions } from '../types.js'
import { allocatePorts, PortConfiguration } from './ports.js'
import { DockerError, toError } from './errors.js'
import { getSessionsDir, getTempBuildDir } from './paths.js'
import { CONTAINER_PREFIX } from './constants.js'
import { cloneOrUpdateRepo } from './git.js'
const { writeFileSync, mkdtempSync, removeSync, readdirSync, statSync } = fse

export const imageExists = async (imageName: string): Promise<boolean> => {
  try {
    await execa('docker', ['image', 'inspect', imageName])
    return true
  } catch {
    return false
  }
}

export const buildImage = async (buildDir: string, imageName: string) => {
  const scriptPath = path.join(
    buildDir,
    'images',
    'chromium-headful',
    'build-docker.sh',
  )

  await execa('bash', [scriptPath], {
    cwd: path.join(buildDir, 'images', 'chromium-headful'),
    env: {
      ...process.env,
      IMAGE: imageName,
    },
    stdio: 'inherit',
  })
}

export interface RunContainerResult {
  subprocess: ExecaChildProcess
  ports: PortConfiguration
}

export const runContainer = async (
  options: DockerRunOptions,
): Promise<RunContainerResult> => {
  const {
    containerName,
    imageName,
    chromeUserDataDir,
    recordingsDir,
    chromiumFlags,
    width,
    height,
  } = options

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'browser-composer-'))
  const flagsFile = path.join(tmpDir, 'chromium-flags')
  writeFileSync(flagsFile, chromiumFlags)

  // Allocate available ports
  const ports = await allocatePorts()

  const isInteractive = process.stdin.isTTY

  const runArgs = [
    'run',
    ...(isInteractive ? ['-it'] : ['-i']),
    '--rm', // Automatically remove container when it exits
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
    imageName,
  ]

  await stopContainer(containerName)

  const subprocess = execa('docker', runArgs, {
    stdio: 'inherit',
    cleanup: false,
  })

  subprocess.on('exit', () => {
    removeSync(tmpDir)
  })

  return { subprocess, ports }
}

export const stopContainer = async (containerName: string) => {
  try {
    await execa('docker', ['rm', '-f', containerName])
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
        await stopContainer(containerName)
      }
    }
  } catch (error) {
    console.warn(
      chalk.yellow('Warning: Could not clean up orphaned containers'),
      error,
    )
  }
}

export const ensureDockerImage = async (imageName: string): Promise<void> => {
  if (!(await imageExists(imageName))) {
    console.log(chalk.yellow('Docker image not found. Building...'))
    const buildDir = getTempBuildDir()

    try {
      await cloneOrUpdateRepo(buildDir)
      await buildImage(buildDir, imageName)
    } catch (error) {
      throw new DockerError(
        `Failed to build Docker image: ${error}`,
        toError(error),
      )
    }
  }
}
