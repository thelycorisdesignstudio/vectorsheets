import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { z } from 'zod';
import { connectDatabase } from './db.js';
import { createWorkbook, deleteWorkbook, getWorkbook, listWorkbooks, updateWorkbook } from './store.js';
import { aiRuntimeConfig, generateWorkbook } from './services/aiGenerator.js';
import { emptyGrid, normalizeGrid } from './services/generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 8080);

const workbookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().max(4000).optional(),
  grid: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
  summary: z.string().max(4000).optional(),
  chart: z
    .object({
      type: z.enum(['bar', 'line', 'none']).default('none'),
      labelColumn: z.number().int().min(0).max(11).default(0),
      valueColumn: z.number().int().min(0).max(11).default(1),
      title: z.string().max(120).default('')
    })
    .optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  activity: z
    .object({
      aiRuns: z.number().int().min(0).optional(),
      lastAction: z.string().max(160).optional()
    })
    .optional()
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true
  })
);

const dbState = await connectDatabase();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'Vectorsheets',
    database: dbState.mode,
    ai: aiRuntimeConfig(),
    message: dbState.message,
    time: new Date().toISOString()
  });
});

app.get('/api/workbooks', async (_req, res, next) => {
  try {
    res.json({ workbooks: await listWorkbooks() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workbooks', async (req, res, next) => {
  try {
    const payload = workbookSchema.parse(req.body);
    const workbook = await createWorkbook({
      name: payload.name || 'Untitled vectorsheet',
      prompt: payload.prompt || '',
      grid: normalizeGrid(payload.grid || emptyGrid()),
      summary: payload.summary || '',
      chart: payload.chart || { type: 'none', labelColumn: 0, valueColumn: 1, title: '' },
      tags: payload.tags || ['workspace'],
      activity: {
        aiRuns: payload.activity?.aiRuns || 0,
        lastAction: payload.activity?.lastAction || 'Created blank workbook'
      }
    });
    res.status(201).json({ workbook });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workbooks/:id', async (req, res, next) => {
  try {
    const workbook = await getWorkbook(req.params.id);
    if (!workbook) return res.status(404).json({ error: 'Workbook not found.' });
    return res.json({ workbook });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/workbooks/:id', async (req, res, next) => {
  try {
    const payload = workbookSchema.parse(req.body);
    const workbook = await updateWorkbook(req.params.id, {
      ...payload,
      grid: payload.grid ? normalizeGrid(payload.grid) : undefined,
      activity: {
        ...payload.activity,
        lastAction: payload.activity?.lastAction || 'Saved workbook'
      }
    });

    if (!workbook) return res.status(404).json({ error: 'Workbook not found.' });
    return res.json({ workbook });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/workbooks/:id', async (req, res, next) => {
  try {
    const deleted = await deleteWorkbook(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Workbook not found.' });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.post('/api/generate', async (req, res, next) => {
  try {
    const body = z
      .object({
        prompt: z.string().trim().min(3).max(4000),
        workbookId: z.string().optional()
      })
      .parse(req.body);

    const generated = await generateWorkbook(body.prompt);
    let workbook;

    if (body.workbookId) {
      const current = await getWorkbook(body.workbookId);
      if (current) {
        workbook = await updateWorkbook(body.workbookId, {
          ...generated.workbook,
          activity: {
            ...generated.workbook.activity,
            aiRuns: (current.activity?.aiRuns || 0) + 1,
            lastAction: generated.workbook.activity?.lastAction || 'Generated from Vector AI'
          }
        });
      }
    }

    if (!workbook) {
      workbook = await createWorkbook(generated.workbook);
    }

    res.json({
      workbook,
      source: generated.source,
      fallbackReason: generated.fallbackReason || '',
      ai: {
        ...aiRuntimeConfig(),
        runtime: generated.source,
        lastError: generated.fallbackReason || ''
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, '..', 'dist')));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request.', details: error.flatten() });
  }

  console.error(error);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`[vectorsheets] API ready on http://127.0.0.1:${port} (${dbState.mode})`);
});
