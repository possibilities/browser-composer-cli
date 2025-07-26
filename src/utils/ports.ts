import * as net from 'net'
import * as dgram from 'dgram'

const checkPortAvailable = (
  port: number,
  type: 'tcp' | 'udp' = 'tcp',
): Promise<boolean> => {
  return new Promise(resolve => {
    if (type === 'tcp') {
      const server = net.createServer()

      server.once('error', () => {
        resolve(false)
      })

      server.once('listening', () => {
        server.close()
        resolve(true)
      })

      server.listen(port, '0.0.0.0')
    } else {
      // For UDP, we need to use dgram module
      const server = dgram.createSocket('udp4')

      server.once('error', () => {
        resolve(false)
      })

      server.once('listening', () => {
        server.close()
        resolve(true)
      })

      server.bind(port, '0.0.0.0')
    }
  })
}

export const findAvailablePort = async (
  startPort: number,
  endPort: number,
): Promise<number> => {
  for (let port = startPort; port <= endPort; port++) {
    if (await checkPortAvailable(port)) {
      return port
    }
  }
  throw new Error(
    `No available ports found between ${startPort} and ${endPort}`,
  )
}

export const findAvailablePortRange = async (
  startPort: number,
  count: number,
  maxAttempts: number = 50,
  type: 'tcp' | 'udp' = 'tcp',
): Promise<number> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const basePort = startPort + attempt * count * 2
    let allAvailable = true

    for (let i = 0; i < count; i++) {
      if (!(await checkPortAvailable(basePort + i, type))) {
        allAvailable = false
        break
      }
    }

    if (allAvailable) {
      return basePort
    }
  }

  throw new Error(
    `No available ${type} port range of ${count} ports found starting from ${startPort}`,
  )
}

export interface PortConfiguration {
  webrtcPort: number
  devtoolsPort: number
  apiPort: number
  udpRangeStart: number
  udpRangeEnd: number
}

export const allocatePorts = async (): Promise<PortConfiguration> => {
  // Find ports in common ranges that are likely to be available
  const webrtcPort = await findAvailablePort(8080, 8180)
  const devtoolsPort = await findAvailablePort(9222, 9322)
  const apiPort = await findAvailablePort(10001, 10101)

  // Find a range of 101 consecutive ports for UDP
  const udpRangeStart = await findAvailablePortRange(56000, 101, 50, 'udp')
  const udpRangeEnd = udpRangeStart + 100

  return {
    webrtcPort,
    devtoolsPort,
    apiPort,
    udpRangeStart,
    udpRangeEnd,
  }
}
