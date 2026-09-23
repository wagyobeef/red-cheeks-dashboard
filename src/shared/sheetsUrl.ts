const SHEETS_ORIGIN = 'https://sheets.googleapis.com'

export function buildOverallValuesUrl(spreadsheetId: string): string {
  const url = new URL(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent('Overall')}`,
    SHEETS_ORIGIN
  )
  url.searchParams.set('majorDimension', 'ROWS')
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  url.searchParams.set('dateTimeRenderOption', 'FORMATTED_STRING')
  return url.toString()
}
