import CDP from 'chrome-remote-interface'
import { ulid } from 'ulid'
import { createConsoleDatabase, runMigrations } from '../db/database.js'
import { consoleMessages } from '../db/consoleSchema.js'
import { getConsoleDatabasePath } from './paths.js'

export interface ConsoleLoggerResult {
  cleanup: () => Promise<void>
}

export async function startConsoleLogging(
  profileName: string,
  devtoolsPort: string | number,
): Promise<ConsoleLoggerResult> {
  const dbPath = getConsoleDatabasePath(profileName)
  const { db, sqlite } = createConsoleDatabase(dbPath)

  await runMigrations(db, sqlite)

  let cdpClient: any
  let retryCount = 0
  const maxRetries = 10
  const retryDelay = 1000

  // Retry connection to Chrome DevTools
  while (retryCount < maxRetries) {
    try {
      cdpClient = await CDP({ port: parseInt(devtoolsPort.toString()) })
      break
    } catch (error) {
      retryCount++
      if (retryCount === maxRetries) {
        sqlite.close()
        throw new Error(
          `Failed to connect to Chrome DevTools after ${maxRetries} attempts`,
        )
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }
  }

  const { Runtime, Console, Page } = cdpClient

  // Track current page URL
  let currentPageUrl: string | null = null

  // Enable Page domain to track navigation
  await Page.enable()

  // Get initial URL
  try {
    const { frameTree } = await Page.getFrameTree()
    currentPageUrl = frameTree.frame.url || null
  } catch (error) {
    // Ignore errors getting initial URL
  }

  // Update URL on navigation
  Page.frameNavigated(({ frame }: any) => {
    if (frame.parentId === undefined) {
      // Main frame only
      currentPageUrl = frame.url || null
    }
  })

  // Enable console domains
  await Console.enable()
  Console.messageAdded(({ message }: any) => {
    const id = ulid()
    const timestamp = message.timestamp
      ? new Date(message.timestamp * 1000)
      : new Date()

    try {
      db.insert(consoleMessages)
        .values({
          id,
          timestamp,
          level: message.level,
          text: message.text,
          url: message.url || message.source || currentPageUrl,
        })
        .run()
    } catch (error: any) {
      // Silently ignore errors to not interfere with browser operation
    }
  })

  await Runtime.enable()
  Runtime.consoleAPICalled(({ type, args, stackTrace }: any) => {
    const id = ulid()
    const timestamp = new Date()

    const argsText = args
      .map((arg: any) => arg.value ?? arg.description ?? JSON.stringify(arg))
      .join(' ')

    try {
      // Extract URL from stack trace if available
      let url = null

      if (
        stackTrace &&
        stackTrace.callFrames &&
        stackTrace.callFrames.length > 0
      ) {
        const topFrame = stackTrace.callFrames[0]
        url = topFrame.url || null
      }

      db.insert(consoleMessages)
        .values({
          id,
          timestamp,
          level: type, // Use console method type as level (log, error, warn, etc.)
          text: argsText,
          url: url || currentPageUrl,
        })
        .run()
    } catch (error: any) {
      // Silently ignore errors to not interfere with browser operation
    }
  })

  // Cleanup function
  const cleanup = async () => {
    try {
      await cdpClient.close()
    } catch (error) {
      // Ignore errors during cleanup
    }
    sqlite.close()
  }

  return { cleanup }
}
