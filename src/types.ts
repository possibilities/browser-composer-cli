export interface SessionConfig {
  name: string
  createdAt: string
  lastUsed: string
  chromeUserDataPath: string
  recordingsPath: string
}

export interface DockerRunOptions {
  containerName: string
  imageName: string
  sessionName?: string
  chromeUserDataDir: string
  recordingsDir: string
  chromiumFlags: string
  width: number
  height: number
  url?: string
}

export interface BuildOptions {
  imageName: string
  buildDir: string
}

export interface PresetConfig {
  name: string
  description?: string
  createdAt: string
  sourceProfile: string
}
