export class DockerError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message)
    this.name = 'DockerError'
  }
}

export class ProfileNotFoundError extends Error {
  constructor(profileName: string) {
    super(`Profile "${profileName}" not found`)
    this.name = 'ProfileNotFoundError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class ContainerError extends Error {
  constructor(
    message: string,
    public containerName?: string,
  ) {
    super(message)
    this.name = 'ContainerError'
  }
}

export const validateProfileName = (name: string): void => {
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

  if (!name || name.trim().length === 0) {
    throw new ValidationError('Profile name cannot be empty')
  }

  if (name.length > 100) {
    throw new ValidationError('Profile name must be 100 characters or less')
  }

  if (!validPattern.test(name)) {
    throw new ValidationError(
      'Profile name must start with a letter or number and contain only letters, numbers, hyphens, and underscores',
    )
  }
}

export const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String(error.message))
  }

  return new Error(String(error))
}
