# Local Development

## Requirements

- Node.js 20 or newer.
- npm.
- MongoDB for persistent local storage.
- Chromium for Playwright smoke tests. Playwright installs this through npm dependencies in most environments.

## Install

```powershell
npm install
```

## Environment Setup

Copy the example environment:

```powershell
Copy-Item .env.example .env
```

Basic local values:

```text
PORT=8080
MONGODB_URI=mongodb://127.0.0.1:27017/vectorsheets
MONGODB_DB=vectorsheets
CLIENT_ORIGIN=http://127.0.0.1:5173
```

If MongoDB is not available, the server uses in-memory storage and reports `database: "memory"` in `/api/health`.

## Run Development Mode

```powershell
npm run dev
```

Development URLs:

```text
Client: http://127.0.0.1:5173
API:    http://127.0.0.1:8080
```

## Run Production Locally

Build:

```powershell
npm run build
```

Start:

```powershell
npm start
```

Production URL:

```text
http://127.0.0.1:8080
```

## Health Check

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' | ConvertTo-Json -Depth 8
```

Expected shape:

```json
{
  "ok": true,
  "product": "Vectorsheets",
  "database": "mongo",
  "ai": {
    "configured": true,
    "provider": "azure-openai",
    "auth": "api-key",
    "runtime": "not-tested"
  }
}
```

## Generate Endpoint Check

```powershell
$body = @{ prompt = 'Build a customer support operations dashboard with tickets by channel, SLA risk, staffing forecast, and summary formulas' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/generate' -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 8
```

The endpoint returns `source: "ai-engine"` when cloud AI succeeds, `source: "fallback-engine"` when cloud AI fails and local generation is used, or `source: "local-engine"` when no cloud provider is configured.

## Verification

Build:

```powershell
npm run build
```

Smoke:

```powershell
npm run smoke
```

The smoke test expects the production server to be available at `http://127.0.0.1:8080`. Override with:

```powershell
$env:APP_URL='http://127.0.0.1:8080'
npm run smoke
```

## Common Local Issues

### Port 8080 Is Already In Use

Find the process:

```powershell
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess
```

Inspect it:

```powershell
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" | Select-Object ProcessId,Name,CommandLine
```

Only stop it if it is the Vectorsheets server or another known local process.

### Build Output Missing

If `npm start` returns a missing `dist/index.html` error, run:

```powershell
npm run build
npm start
```

### MongoDB Unavailable

The app remains usable. Workbooks are stored in memory for the current server process.
