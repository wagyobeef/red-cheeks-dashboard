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
- Year-to-date profit will be the primary metric
- Other metrics shown in the yearly overview will be ytd volume (both bought and sold), number of unresolved items, and unresolved costs

### Data Mapping

Source sheet: `Overall`

- Month indicator -> Column A (formatted month-year, e.g. `Jan 2026`)
- Profit indicator ->  Column F
- Number of Unresolved Items indicator -> Column D
- Unresolved Costs indicator -> Column E
- Buy Volume indicator -> Column B
- Sale Volume indicator -> Column C

YTD metrics will be aggregrated along rows that have the same year, according to the Month indicator

---

### Monthly Overview
- Will display month-to-month metrics for a given year in the form of a bar chart
- The bar chart spans each month of the calendar year with the height of the bars signifying the value of the chosen metric for that month for the given year
- All months will show up on the axis of the bar chart regardless of whether data exists for it 
- The metric can be chosen with a segmented selector, and the year can be toggled with chevrons on either side of the chart
- The chart defaults to the current year
- When a bar is hovered over, it should show the exact value of the bar

#### Data Mapping

Source sheet: `Overall`

- Month + Year Indicator -> Column A (formatted month-year, e.g. `Jan 2026`)
- Note: since month abbreviations might vary, match the month abbreviation to which month it is a prefix for

Metrics:
- `Profit` -> Column F
- `Sale Volume` -> Column G
- `Buy Volume` -> Column B

- Bar Height -> the cell value at the row of the month + year and column of the chosen metric

