# Home implementation plan

Approved plan for the initial Home screen. This is the current implementation effort.

## Behavior

The Home screen shows a Yearly Overview card and a Monthly Overview card.

The yearly card is titled Yearly Overview. Profit is the primary figure. Purchase volume, sale volume, unresolved items, and unresolved costs sit with it. A segmented control lists the years in the sheet, includes the current calendar year when it is missing, and ends with All. The current calendar year is selected by default. A chosen year sums `Overall` rows for that year. All sums every readable row. A blank number counts as zero. A value that is not a number stops that card and names the problem. Rows with an unreadable month are excluded. A year, or All, with no readable rows is an empty state, separate from a real total of zero. Two rows in the same month are both included in the yearly sums. Choosing a year or All does not change the monthly chart.

The monthly card is titled Monthly Overview. It is a bar chart for its own year and starts on the current calendar year. Chevrons on either side of the chart move one year at a time, from the earlier of the current year and the earliest monthly year through the later of the current year and the latest monthly year. Profit, Purchase Volume, and Sale Volume are on the left. A platform menu on the right of that row offers All, Card Show, eBay, Fanatics, Alt, and Goldin. All includes every platform. Profit is selected first. January through December are always on the axis. Hovering a bar shows its exact dollar value. The chart has a dollar y-axis. A negative value draws below a zero line. Changing the metric, platform, or monthly year uses the sheets already loaded.

Columns on `Overall`, by position:

- Month: column A, a month-year such as `Jan 2026`. The month token matches when it is a unique prefix of one full month name, so `Sept` and `September` both mean September.
- Purchase volume: column B on `Overall` for the yearly card
- Yearly sale volume: column C on `Overall`
- Unresolved items: column D on `Overall`
- Unresolved cost: column E on `Overall`
- Yearly profit: column F on `Overall`

Monthly values come from other tabs:

- `AllMonths` column H is the month, such as `Jan-2026` or `January 2026`. Column F is the platform. Column G is profit. Column D is sale price.
- Each month has a tab named the same way as its month indicator. Column C is the purchase price. Column E is the platform.
- A missing month tab is a zero purchase bar. Two tabs for the same month stop the monthly card and name that month. A summed cell that is blank or not a number is left out of the total.

A first row whose column A is not a month-year is a header and is ignored. Later rows with an unreadable month are excluded from the totals.

Profit, bought, sold, and unresolved cost display as US dollars. Unresolved items display as a count.

## Architecture

New Electron app. The main process is the only code that talks to Google. The window uses a preload bridge, with context isolation on and Node integration off.

Read-only access:

- The only OAuth scope is `https://www.googleapis.com/auth/spreadsheets.readonly`.
- The only Sheets call is a GET of the values on `Overall`.
- The OAuth client id, client secret, refresh token, and spreadsheet id stay in Electron’s user-data directory, not in the repo.

The user enters the Google OAuth client once, pastes the spreadsheet URL or id, and signs in. That choice is saved on this machine. If the Google Cloud app is still in testing, a refresh token can expire after about 7 days, and the app asks the user to sign in again.

The window has a sidebar with Home selected, a manual refresh, and a load when the window opens. Setup, sign-in failure, a missing tab, and an empty year all show on the yearly card. The monthly chart is inline SVG in the same card style. Styling follows the design doc: warm, minimal, desktop-first, cards with a light border and shadow.

## Steps

1. Scaffold the Electron and TypeScript app, the secure window, the preload bridge, and the Home shell.
2. Add local settings for the OAuth client and the spreadsheet URL.
3. Add read-only sign-in and token storage.
4. Read `Overall`, list the years in the sheet, and aggregate the selected year.
5. Build the Yearly Overview card and its empty and error states.
6. Cover month parsing and the yearly sums with unit tests.

## Files

New code under `src/main`, `src/preload`, and `src/renderer`, plus `package.json`, TypeScript and Electron config, and `.gitignore`. Shared aggregation and formatting live under `src/shared` so tests can run them without Electron.

## Acceptance criteria

- The app opens as a desktop window with a sidebar and the Yearly Overview card.
- The user can save a spreadsheet URL or id locally and sign in with Google.
- The granted scope is spreadsheets read-only, and the code only reads values.
- The yearly card is titled Yearly Overview. Its segmented control lists sheet years, the current calendar year, and All. It shows profit, purchase volume, sale volume, unresolved items, and unresolved costs for the selected year, or across every readable row when All is selected.
- The monthly card charts January through December for its own year, defaulting to the current calendar year. Profit and sale volume come from `AllMonths`. Purchase volume comes from each month tab. A platform menu filters those sums. Hovering a bar shows its exact value.
- Missing setup, auth failure, a missing tab, and a year with no rows are visible and do not appear as a zero total.
- Secrets and tokens are not committed.
- Unit tests cover month parsing and the yearly sums.

## Verification

Unit tests for parsing and aggregation, then a local launch to check the sidebar, setup states, and card. A live read of the sheet needs the user's Google OAuth client and spreadsheet.

## Status

- [x] Scaffold the Electron app and Home shell
- [x] Save the OAuth client and spreadsheet locally
- [x] Read-only Google sign-in and token storage
- [x] Read `Overall`, list sheet years, and aggregate the selected year
- [x] Yearly Overview card, including empty and error states
- [x] Unit tests for month parsing and yearly sums
- [x] Monthly chart from `AllMonths` and month tabs, with a platform filter

Verified with unit tests, an Electron smoke check of the setup form, and a desktop layout pass of the setup screen, yearly totals, empty year, and missing-column error. A live read of the sheet still needs the user's Google OAuth client and spreadsheet.
