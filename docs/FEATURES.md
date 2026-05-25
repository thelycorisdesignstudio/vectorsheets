# Feature Guide

This document describes the shipped product workflows in Vectorsheets.

## Workbook Generation

Users can type a business request into the prompt box and generate an editable workbook. Generation uses cloud AI when configured and falls back to the local workbook engine when cloud AI fails.

Supported local workbook templates include:

- SaaS revenue forecast.
- Engineering hiring plan.
- Q3 sales intelligence dashboard.
- Household budget control.
- Support operations command center.
- Operating priority model.

## Spreadsheet Editing

The grid supports:

- Cell selection.
- Double-click editing.
- Formula bar editing.
- Keyboard navigation.
- Enter to edit.
- Delete or Backspace to clear.
- Paste from spreadsheet text.
- CSV import.

## Formula Engine

Supported formulas:

- Cell references such as `A1`.
- Ranges such as `A1:A10`.
- Arithmetic operations.
- Comparisons.
- `SUM`
- `AVERAGE`
- `AVG`
- `MIN`
- `MAX`
- `COUNT`
- `MEDIAN`
- `ABS`
- `ROUND`
- `IF`
- `SUMIF`
- `COUNTIF`
- `AVERAGEIF`

The engine returns formula errors as visible spreadsheet values such as `#ERR` or `#CIRC`.

## Data Tools

Data tools operate on the selected row or column:

- Sort A to Z.
- Sort Z to A.
- Insert row.
- Delete row.
- Insert column.
- Delete column.
- Clear row.
- Clear column.
- Fill blanks down.
- Remove duplicate rows.
- Move blank rows down.

## Search and Filtering

The sheet toolbar supports:

- Find in sheet.
- Previous match.
- Next match.
- Highlighted matches.

The inspector supports selected-column row filtering, preserving the header row and showing a filtered row count.

## Formatting

Formatting controls support:

- Number.
- Currency.
- Percent.

Formatting writes the formatted value back into the selected cell.

## Validation

Validation rules highlight cells in the selected column:

- Required.
- Numbers only.
- Unique values.
- Formula errors.

Validation issue counts are surfaced in the inspector and status bar.

## Visual Rules

Visual rules highlight selected-column cells:

- Above average.
- Top value.
- Negative.
- Duplicates.
- Blanks.

## Summary Builder

The Summary Builder behaves like a compact pivot table workflow:

- Detects likely group and value columns.
- Shows top grouped sums.
- Writes a summary table back to the sheet.
- Writes and charts a summary in one action.
- Exports summary CSV.

## Named Ranges

Named ranges let users save the selected column's active data range under a short name. Saved ranges are scoped to the current workbook and stored locally.

Named range actions:

- Save the selected column's data range.
- Replace an existing range with the same name.
- Insert `=SUM(<range>)` into the selected cell.
- Delete saved ranges.
- Include named ranges in exported HTML and JSON reports.

## Formula Templates

Formula templates provide one-click insertion for more advanced formulas:

- `SUMIF`
- `COUNTIF`
- `AVERAGEIF`
- `IF`
- `ROUND`

Templates use the current workbook context where possible, including the Summary Builder group/value columns and selected column data range.

## Workbook Health

The Workbook Health section summarizes:

- Formula errors.
- Validation issues.
- Named ranges.
- Summary rows.

The `Go to first issue` action moves selection to the first formula or validation issue.

## AI Runtime

The AI Runtime section shows:

- Provider.
- Runtime.
- Model.
- Auth mode.
- Latest cloud AI error when fallback is active.

This gives operators and users a visible answer when cloud AI is configured but rejected by the provider.

## Charts and Forecasts

Chart tools support:

- Bar charts.
- Line charts.
- Label column selection.
- Value column selection.
- Chart title editing.
- Four-period forecast writeback from chart trend.

## Cell Intelligence

The inspector shows:

- Selected cell reference.
- Cell type.
- Rendered value.
- Raw value.
- Column header.
- Upstream formula references.
- Downstream dependents.
- Cell notes.

## Notes, Versions, and Scenarios

Local browser storage supports:

- Cell notes.
- Cell note markers.
- Version snapshots.
- Version restore.
- Scenario presets.

These are keyed by workbook ID when available, or by the local draft key.

## Exports

Exports include:

- CSV workbook export.
- JSON workbook report.
- HTML workbook report.
- Summary CSV export.

Reports include workbook metadata, stats, audit output, validation status, summary rows, chart configuration, scenarios, notes, and grid data.
