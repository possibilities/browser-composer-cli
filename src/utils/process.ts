import { ExecaChildProcess } from 'execa'

export const setupGracefulShutdown = (
  subprocess: ExecaChildProcess,
  _containerName: string,
  cleanup?: () => void,
) => {
  const handleShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`)

    if (cleanup) {
      cleanup()
    }

    subprocess.kill('SIGTERM')

    setTimeout(() => {
      process.exit(0)
    }, 2000)
  }

  process.on('SIGINT', () => handleShutdown('SIGINT'))
  process.on('SIGTERM', () => handleShutdown('SIGTERM'))
}
