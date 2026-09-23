const SHEETS_ORIGIN = 'https://sheets.googleapis.com'

function readOptions(url: URL): void {
  url.searchParams.set('majorDimension', 'ROWS')
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  url.searchParams.set('dateTimeRenderOption', 'FORMATTED_STRING')
}

export function buildSheetTitlesUrl(spreadsheetId: string): string {
  const url = new URL(`/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`, SHEETS_ORIGIN)
  url.searchParams.set('fields', 'sheets.properties.title')
  return url.toString()
}

export function buildValuesBatchUrl(spreadsheetId: string, titles: string[]): string {
  const url = new URL(`/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`, SHEETS_ORIGIN)
  for (const title of titles) url.searchParams.append('ranges', title)
  readOptions(url)
  return url.toString()
}
