import { execa } from 'execa'

export interface PortInfo {
  host: string
  port: string
}

export interface PortMappings {
  webrtc: PortInfo
  devtools: PortInfo
  api: PortInfo
}

export async function getContainerPortMappings(
  containerName: string,
): Promise<PortMappings | null> {
  try {
    const { stdout } = await execa('docker', ['port', containerName])
    const portMappings = stdout.split('\n').filter(Boolean)

    const extractPortInfo = (
      mapping: string,
      defaultPort: string,
    ): PortInfo => {
      const match = mapping.match(/([0-9.]+):([0-9]+)$/)
      if (match) {
        return {
          host: match[1] === '0.0.0.0' ? 'localhost' : match[1],
          port: match[2],
        }
      }
      return { host: 'localhost', port: defaultPort }
    }

    const webrtcInfo = extractPortInfo(
      portMappings.find(p => p.includes('8080/tcp')) || '',
      '8080',
    )
    const devtoolsInfo = extractPortInfo(
      portMappings.find(p => p.includes('9222/tcp')) || '',
      '9222',
    )
    const apiInfo = extractPortInfo(
      portMappings.find(p => p.includes('10001/tcp')) || '',
      '10001',
    )

    return {
      webrtc: webrtcInfo,
      devtools: devtoolsInfo,
      api: apiInfo,
    }
  } catch {
    return null
  }
}
