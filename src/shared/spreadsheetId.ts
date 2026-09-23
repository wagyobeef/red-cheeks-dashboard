const FROM_URL = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
const RAW_ID = /^[a-zA-Z0-9-_]+$/

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const fromUrl = FROM_URL.exec(trimmed)
  if (fromUrl) return fromUrl[1]

  if (RAW_ID.test(trimmed) && trimmed.length >= 10) return trimmed
  return null
}
