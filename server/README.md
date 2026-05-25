# Vectorsheets Server

The server is an Express API for workbook persistence and AI-backed workbook generation.

## Important Files

```text
server/index.js                 API routes and static hosting
server/db.js                    MongoDB connection with memory fallback
server/store.js                 Workbook persistence abstraction
server/models/Workbook.js       Mongoose workbook model
server/services/generator.js    Local deterministic workbook engine
server/services/aiGenerator.js  Cloud AI provider integration and fallback
```

## Runtime Modes

### MongoDB Mode

When `MONGODB_URI` is valid, workbooks persist through MongoDB.

### Memory Mode

When MongoDB is unavailable, the server seeds starter workbooks into memory. This is useful for demos and local development but data is not durable across server restarts.

## AI Modes

### Cloud AI

`server/services/aiGenerator.js` supports Azure OpenAI and OpenAI through the Responses API. Cloud output is validated against a strict workbook schema before being converted into the internal workbook shape.

### Local Engine

`server/services/generator.js` produces deterministic workbooks for known business prompt categories. This keeps the product usable when cloud AI is unavailable.

### Fallback Engine

If cloud AI is configured but fails, the API returns a local workbook and reports `source: "fallback-engine"`.

## API Routes

```text
GET    /api/health
GET    /api/workbooks
POST   /api/workbooks
GET    /api/workbooks/:id
PATCH  /api/workbooks/:id
DELETE /api/workbooks/:id
POST   /api/generate
```

## Hosting

After `npm run build`, the server serves `dist/` and the React app from:

```text
http://127.0.0.1:8080
```
