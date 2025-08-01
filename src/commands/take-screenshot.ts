import { Command } from 'commander'
import CDP from 'chrome-remote-interface'
import { containerIsRunning } from '../utils/docker.js'
import { CONTAINER_PREFIX } from '../utils/constants.js'
import { validateProfileName } from '../utils/errors.js'
import { getSessionDir, getScreenshotsDir } from '../utils/paths.js'
import { existsSync, writeFileSync } from 'fs'
import * as path from 'path'
import { execa } from 'execa'

export const takeScreenshotCommand = new Command('take-screenshot')
  .description('Take a screenshot of the browser')
  .argument('<profile>', 'Profile name')
  .argument('[selector]', 'Optional DOM selector to focus on')
  .option('--desktop', 'Capture entire desktop instead of browser viewport')
  .action(async (profile, selector, options) => {
    try {
      validateProfileName(profile)

      const sessionDir = getSessionDir(profile)
      if (!existsSync(sessionDir)) {
        process.stderr.write(`Profile "${profile}" does not exist\n`)
        process.exit(1)
      }

      const containerName = `${CONTAINER_PREFIX}-${profile}`
      if (!(await containerIsRunning(containerName))) {
        process.stderr.write(`Container ${containerName} is not running\n`)
        process.exit(1)
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/T/, '-')
        .replace(/:/g, '-')
        .replace(/\..+/, '')
        .replace(/Z/, '')
      const filename = `screenshot-${timestamp}.png`
      const screenshotsDir = getScreenshotsDir(profile)
      const filepath = path.join(screenshotsDir, filename)

      if (options.desktop) {
        if (selector) {
          process.stderr.write(
            'Warning: selector argument is ignored when using --desktop flag\n',
          )
        }

        const containerTempPath = '/tmp/browser_composer_desktop_screenshot.png'

        try {
          await execa('docker', [
            'exec',
            containerName,
            'rm',
            '-f',
            containerTempPath,
          ]).catch(() => {})

          await execa('docker', [
            'exec',
            '-e',
            'DISPLAY=:1',
            containerName,
            'scrot',
            containerTempPath,
          ])

          const { stdout: screenshotData } = await execa(
            'docker',
            ['exec', containerName, 'cat', containerTempPath],
            {
              encoding: 'buffer',
              maxBuffer: 10 * 1024 * 1024,
            },
          )
          writeFileSync(filepath, screenshotData)

          await execa('docker', [
            'exec',
            containerName,
            'rm',
            '-f',
            containerTempPath,
          ]).catch(() => {})

          console.log(filepath)
          process.exit(0)
        } catch (error: any) {
          process.stderr.write(
            `Error capturing desktop screenshot: ${error.message || error}\n`,
          )
          process.exit(1)
        }
      }

      let devtoolsPort = '9222'
      try {
        const { stdout } = await execa('docker', ['port', containerName])
        const portMappings = stdout.split('\n').filter(Boolean)
        const devtoolsMapping = portMappings.find(p => p.includes('9222/tcp'))
        if (devtoolsMapping) {
          const match = devtoolsMapping.match(/:([0-9]+)$/)
          if (match) devtoolsPort = match[1]
        }
      } catch (error) {
        process.stderr.write(
          'Warning: Could not retrieve port information, using default 9222\n',
        )
      }

      let cdpClient: any
      try {
        cdpClient = await CDP({ port: parseInt(devtoolsPort) })
      } catch (error) {
        process.stderr.write(
          `Failed to connect to Chrome DevTools on port ${devtoolsPort}\n`,
        )
        process.exit(1)
      }

      const { Page, Runtime } = cdpClient

      await Page.enable()

      let screenshotOptions: any = {
        format: 'png',
      }

      if (selector) {
        try {
          const result = await Runtime.evaluate({
            expression: `
              (() => {
                const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!element) return null;
                const rect = element.getBoundingClientRect();
                return {
                  x: rect.left,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height,
                  scale: window.devicePixelRatio || 1
                };
              })()
            `,
            returnByValue: true,
          })

          if (!result.result.value) {
            process.stderr.write(`Selector "${selector}" not found\n`)
            await cdpClient.close()
            process.exit(1)
          }

          const bounds = result.result.value
          screenshotOptions.clip = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            scale: bounds.scale,
          }
        } catch (error) {
          process.stderr.write(`Error evaluating selector: ${error}\n`)
          await cdpClient.close()
          process.exit(1)
        }
      }

      const screenshot = await Page.captureScreenshot(screenshotOptions)
      const buffer = Buffer.from(screenshot.data, 'base64')

      writeFileSync(filepath, buffer)
      console.log(filepath)

      await cdpClient.close()
    } catch (error: any) {
      process.stderr.write(`Error: ${error.message || error}\n`)
      process.exit(1)
    }
  })
