# Home

## Purpose
Give me an at-a-glance view of the current state of the Red Cheeks business, as defined by a meticulously kept Google Sheets

The Google Sheet is the source of truth for business data

## Data Source

The dashboard will connect to the Google Sheet through the appropriate Google API

## Critical Constraint

Access to the Google Sheet must be **strictly read-only**.

The dashboard must never modify, delete, append, or otherwise alter
data in the source Google Sheet.

The Google Sheet is the business's source of truth and should not be
tampered with by the application.

---

## Initial Cards

### Yearly Overview
- Card that displays aggregated metrics, primarily for a particular year
- Will also have the option to view metrics by `All`, which shows total metric values across all years
- Year-to-date metrics will be aggregated along rows that have the same year, according to the Month indicator
- Segemented selector allows user to choose the year with an `All` option at the end; selector defaults to current year
- Title of card: `Yearly Overview`

### Metrics
- `Profit` (primary metric)
- `Purchase volume`
- `Sale volume`
- `Unresolved items`
- `Unresolved costs`

### Data Mapping

Source sheet: `Overall`

- Month indicator -> Column A (formatted month-year, e.g. `Jan 2026`)
- `Profit` indicator ->  Column F
- `Purchase Volume` indicator  -> Column B
- `Sale Volume` indicator -> Column C
- `Unresolved items` indicator -> Column D
- `Unresolved costs` indicator -> Column E

---

### Monthly Overview
- Title of card: `Monthly Overview`
- Displays month-to-month metrics for a given year in the form of a bar chart
- On the left of the card will be a segmented selector to choose a desired metric (`Profit`, `Purchase Volume`, `Sale Volume`)
- On the far right of the same row as the segmented selector will be dropdown for choosing the platform with the options:
    - `All` (no platform filter)
    - `Card Show`
    - `eBay`
    - `Fanatics`
    - `Alt`
    - `Goldin`
- The bar chart spans each month of the calendar year with the height of the bars signifying the value of the chosen metric for that month, for the given year, and for the chosen platform
- All months will show up on the x-axis of the bar chart regardless of whether data exists for it 
- The y-axis will be marked with reasonable scaling
- The year is toggled by chevrons on either side of the chart
- The chart defaults to the current year
- When a bar is hovered over, it should show the exact value of the bar

#### Calculating Metrics for Each Bar
- Note: `Month indicator` refers to a formatted month + year that represents the month that a particular bar is representing (e.g. `Jan-2026`). Since month abbreviations might vary, match the month abbreviation to which month it is a prefix for
- Note: if a cell that is being summed is not a number or does not have a value, exclude it from the summation
- Calculating `Profit`: go to the `AllMonths` sheet. Sum up the profit column (Column G), filtered by rows that match the month indicator (Column H) and platform (Column F)
- Calculating `Purchase Volume`: go to the sheet corresponding to the month indicator. In that sheet, sum up the Purchase price column (Column C), filtered by the Source Column (Column E), which is defined by the platform selector
- Calculating `Sale Volume`: go to the `AllMonths` sheet. Sum up the Sale price column (Column D), filtered by rows that match the month indicator (Column H) and platform (Column F)
