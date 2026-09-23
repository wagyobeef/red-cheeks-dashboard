# Home implementation plan

Approved plan for the initial Home screen. This is the current implementation effort.

## Behavior

The Home screen shows a Yearly Overview card and a Monthly Overview card.

Year-to-date profit is the primary yearly figure. Buy volume, sale volume, unresolved item count, and unresolved cost sit with it. All five numbers are sums of `Overall` rows for the selected year. The yearly card lists every year found in the sheet. The current calendar year is selected when it is present; otherwise the latest year in the sheet is selected. Choosing another year shows that year's totals. A blank number counts as zero. A value that is not a number stops that card and names the problem. Rows with an unreadable month are excluded. A year with no readable rows is an empty state, separate from a real total of zero. Two rows in the same month are both included in the yearly sums.

The monthly card is a bar chart for its own year. It starts on the current calendar year. Chevrons on either side of the chart move one year at a time, from the earlier of the current year and the earliest sheet year through the later of the current year and the latest sheet year. A segmented control chooses Profit, Sale volume, or Buy volume, and Profit is selected first. January through December are always on the axis. The bar is the single cell for that month and year. A missing month or a blank cell is zero. Hovering a bar shows its exact dollar value. The chart has a dollar y-axis so the bar heights can be read without hovering. A negative value draws below a zero line. A second row for the same month and year stops the monthly card and names that month. A non-numeric value in column B, F, or G on a row for the displayed year stops the monthly card and names the column and row. Changing the metric or the monthly year uses the sheet already loaded.

Columns on `Overall`, by position:

- Month: column A, a month-year such as `Jan 2026`. The month token matches when it is a unique prefix of one full month name, so `Sept` and `September` both mean September.
- Buy volume: column B. The yearly and monthly cards both use it.
- Yearly sale volume: column C
- Unresolved items: column D
- Unresolved cost: column E
- Profit: column F. The yearly and monthly cards both use it.
- Monthly sale volume: column G

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
- The yearly card lists the years in `Overall` and shows sums for the selected year: profit, bought, sold, unresolved count, and unresolved cost. The current calendar year is selected when it is in the sheet.
- The monthly card charts January through December for its own year, defaulting to the current calendar year. Profit, sale volume from column G, and buy volume can be selected. Hovering a bar shows its exact value.
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
- [x] Monthly chart for the selected year, including column G, the 12-month axis, and hover values

Verified with unit tests, an Electron smoke check of the setup form, and a desktop layout pass of the setup screen, yearly totals, empty year, and missing-column error. A live read of the sheet still needs the user's Google OAuth client and spreadsheet.
