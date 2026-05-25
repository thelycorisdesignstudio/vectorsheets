# Vectorsheets

Vectorsheets is a MERN spreadsheet agent for generating, editing, analyzing, validating, and exporting business workbooks from natural language.

The product is designed to feel familiar to Excel users: a clean workbook list, formula bar, grid, charting surface, data tools, validation, summary builder, local versioning, notes, and export flows. Cloud AI generation is supported server-side, and the app keeps working through a deterministic local workbook engine when cloud credentials are missing or rejected.

## Current Status

- Local production host: `http://127.0.0.1:8080`
- Client: React + Vite
- API: Express
- Database: MongoDB through Mongoose, with in-memory fallback
- AI providers: Azure OpenAI Responses API, OpenAI Responses API, deterministic local workbook engine
- Smoke coverage: browser workflow across import, formulas, search, filtering, validation, summaries, reports, CRUD, generation, save, and forecast writeback

## Product Capabilities

- Natural-language workbook generation.
- Editable spreadsheet grid with formula bar.
- Formula engine with references, ranges, arithmetic, comparisons, `IF`, `ROUND`, `ABS`, `SUM`, `AVERAGE`, `AVG`, `MIN`, `MAX`, `COUNT`, `MEDIAN`, `SUMIF`, `COUNTIF`, and `AVERAGEIF`.
- CSV import and paste-to-grid import.
- CSV, JSON report, HTML report, and summary CSV export.
- Undo and redo for workbook edits.
- Workbook create, duplicate, save, delete, and refresh.
- Find in sheet with highlighted matches.
- Number, currency, and percent formatting.
- Sort ascending/descending by selected column.
- Insert, delete, and clear rows/columns.
- Move blank rows down.
- Fill blanks down in selected column.
- Remove duplicate rows by selected column.
- Data quality score for selected column.
- Validation rules for required cells, numeric cells, unique values, and formula errors.
- Conditional visual rules for above-average values, top values, negatives, duplicates, and blanks.
- Pivot-style summary builder with smart group/value detection.
- Summary writeback to the sheet.
- Summary chart generation.
- Named ranges saved per workbook with one-click SUM insertion.
- Formula templates for `SUMIF`, `COUNTIF`, `AVERAGEIF`, `IF`, and `ROUND`.
- Workbook health diagnostics for formula errors, validation issues, named ranges, and summary readiness.
- AI runtime panel with provider, model, auth mode, runtime, and latest cloud error.
- Chart configuration for bar and line charts.
- Forecast writeback from chart trend.
- Scenario console with saved local presets.
- Cell notes with grid markers.
- Cell intelligence, references, dependents, raw values, and rendered values.
- Local version snapshots and restore.
- Responsive desktop and mobile UI.

## Repository Layout

```text
.
|-- client/
|   |-- index.html
|   `-- src/
|       |-- App.jsx
|       |-- main.jsx
|       |-- styles.css
|       `-- lib/
|           |-- api.js
|           `-- sheet.js
|-- server/
|   |-- index.js
|   |-- db.js
|   |-- store.js
|   |-- models/
|   |   `-- Workbook.js
|   `-- services/
|       |-- aiGenerator.js
|       `-- generator.js
|-- scripts/
|   `-- smoke.mjs
|-- docs/
|-- package.json
|-- vite.config.js
|-- .env.example
`-- README.md
```

## Quick Start

Install dependencies:

```powershell
npm install
```

Run the full local development stack:

```powershell
npm run dev
```

Development URLs:

```text
Client: http://127.0.0.1:5173
API:    http://127.0.0.1:8080
```

Build and host production locally:

```powershell
npm run build
npm start
```

Production URL:

```text
http://127.0.0.1:8080
```

## Environment

Create `.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Minimum local configuration:

```text
PORT=8080
MONGODB_URI=mongodb://127.0.0.1:27017/vectorsheets
MONGODB_DB=vectorsheets
CLIENT_ORIGIN=http://127.0.0.1:5173
```

If MongoDB is unavailable, the server uses in-memory workbooks so the product remains usable.

## AI Configuration

Azure OpenAI with API-key auth:

```text
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_AUTH_MODE=key
AZURE_OPENAI_API_KEY=your-key
```

Azure bearer-token auth:

```text
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_AUTH_MODE=bearer
AZURE_OPENAI_BEARER_TOKEN=your-token
```

Azure `DefaultAzureCredential` auth:

```text
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_AUTH_MODE=entra
AZURE_OPENAI_TOKEN_SCOPE=https://ai.azure.com/.default
```

OpenAI Responses API:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o-mini
```

If cloud AI fails, Vectorsheets returns a working local workbook and exposes the runtime state through `/api/health`.

## API Endpoints

```text
GET    /api/health
GET    /api/workbooks
POST   /api/workbooks
GET    /api/workbooks/:id
PATCH  /api/workbooks/:id
DELETE /api/workbooks/:id
POST   /api/generate
```

Health response includes database and AI runtime status:

```json
{
  "ok": true,
  "product": "Vectorsheets",
  "database": "mongo",
  "ai": {
    "configured": true,
    "provider": "azure-openai",
    "model": "gpt-4o-mini",
    "endpoint": "configured",
    "auth": "api-key",
    "runtime": "fallback-engine",
    "lastError": "401 Access denied due to invalid subscription key or wrong API endpoint..."
  }
}
```

## Verification

Run a production build:

```powershell
npm run build
```

Run the browser smoke test against `http://127.0.0.1:8080`:

```powershell
npm run smoke
```

The smoke test covers:

- Loading the app.
- CSV import.
- Formula evaluation including `SUMIF` and `COUNTIF`.
- Undo and redo.
- Sheet search.
- Filtering.
- Validation rules.
- Conditional formatting.
- Summary builder.
- Summary export.
- Named ranges.
- Formula templates.
- Notes.
- Number formatting.
- Sorting.
- Row editing.
- Quick formulas.
- Data cleanup.
- Version snapshots.
- Scenario presets.
- JSON and HTML report exports.
- Charting.
- Workbook duplicate/delete.
- Prompt generation.
- Save.
- Forecast writeback.

## Documentation

- [Documentation Index](docs/README.md)
- [Feature Guide](docs/FEATURES.md)
- [Local Development](docs/LOCAL_DEVELOPMENT.md)
- [AI Configuration and Troubleshooting](docs/AI_CONFIGURATION.md)
- [Client Notes](client/README.md)
- [Server Notes](server/README.md)

## Security Notes

- Do not commit `.env`.
- Do not commit real API keys or bearer tokens.
- All AI credentials stay server-side.
- The client calls `/api/generate`; it never receives provider secrets.
- `.gitignore` excludes `.env`, build output, node modules, logs, and generated screenshots.

## Known Runtime Behavior

If Azure returns `401 Access denied due to invalid subscription key or wrong API endpoint`, the app is functioning but the Azure key and endpoint do not match. Update the Azure endpoint, deployment, and key in `.env`, then restart the server. Until then, Vectorsheets uses `Local AI fallback` and still generates useful workbooks.
