declare module 'chrome-remote-interface' {
  interface CDPOptions {
    port?: number
    host?: string
    secure?: boolean
    target?: string
  }

  interface CDPClient {
    Runtime: {
      enable(): Promise<void>
      consoleAPICalled(callback: (params: any) => void): void
    }
    Console: {
      enable(): Promise<void>
      messageAdded(callback: (params: any) => void): void
    }
    Page: {
      enable(): Promise<void>
      getFrameTree(): Promise<{ frameTree: { frame: { url?: string } } }>
      frameNavigated(callback: (params: any) => void): void
    }
    close(): Promise<void>
  }

  function CDP(options?: CDPOptions): Promise<CDPClient>

  export = CDP
}
