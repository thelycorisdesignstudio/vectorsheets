# Vectorsheets Client

The client is a React/Vite spreadsheet workbench.

## Important Files

```text
client/src/App.jsx        Main product shell and application state
client/src/styles.css     Minimal Excel-like visual system
client/src/lib/api.js     API wrapper
client/src/lib/sheet.js   Client-side sheet engine and formula evaluator
client/src/main.jsx       React entrypoint
```

## UI Structure

The main app layout is:

```text
Sidebar
  Brand
  Workbook search
  New workbook
  Workbook list
  Templates
  Operator kits
  Runtime status

Main stage
  Topbar actions
  Prompt command center
  Workbook panel
    Sheet tools
    Formula bar
    Grid
    Status bar
  Inspector panel
    Metrics
    Model ops
    Data tools
    Summary builder
    Named ranges
    Quick formulas
    Quality
    Visual rules
    Validation
    Assistant notes
    Workbook health
    AI runtime
    Versions
    Cell intelligence
    Column profile
    Schema map
    Chart
    Scenario console
    Activity log
    Audit
```

## Design Direction

The UI intentionally stays close to spreadsheet software:

- White surfaces.
- Compact controls.
- Green spreadsheet accent.
- Monospaced workbook and cell details.
- Clear grid lines.
- Inspector tools grouped by spreadsheet workflow instead of marketing copy.
- Minimal decorative styling.
- Responsive mobile stacking.

Avoid adding marketing-style hero sections or decorative visual effects inside the working app.

## Local Client Dev

Run the Vite client with:

```powershell
npm run client:dev
```

The Vite dev server proxies `/api` to the Express API through `vite.config.js`.
