export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export function googleErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('response' in error)) return null
  const response = error.response
  if (typeof response !== 'object' || response === null || !('data' in response)) return null
  const data = response.data
  if (typeof data !== 'object' || data === null || !('error' in data)) return null
  return typeof data.error === 'string' ? data.error : null
}

export function logSafe(error: unknown): void {
  if (error instanceof Error) {
    console.error(error.name, error.message.replace(/ya29\.[A-Za-z0-9._-]+/g, '[token]'))
    return
  }
  console.error('Unexpected failure')
}
