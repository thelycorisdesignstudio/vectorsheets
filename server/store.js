import crypto from 'node:crypto';
import Workbook from './models/Workbook.js';
import { isMongoReady } from './db.js';
import { countFormulaCells, normalizeGrid, starterWorkbooks } from './services/generator.js';

const memory = new Map();

function enrich(workbook) {
  const now = new Date().toISOString();
  return {
    id: workbook.id || crypto.randomUUID(),
    owner: workbook.owner || 'SuperOrbit Studio',
    status: workbook.status || 'Live model',
    name: workbook.name || 'Untitled vectorsheet',
    prompt: workbook.prompt || '',
    grid: normalizeGrid(workbook.grid),
    summary: workbook.summary || '',
    chart: workbook.chart || { type: 'none', labelColumn: 0, valueColumn: 1, title: '' },
    tags: workbook.tags || [],
    activity: {
      aiRuns: Number(workbook.activity?.aiRuns || 0),
      formulaCells: Number(workbook.activity?.formulaCells || countFormulaCells(workbook.grid || [])),
      lastAction: workbook.activity?.lastAction || 'Updated workbook'
    },
    createdAt: workbook.createdAt || now,
    updatedAt: workbook.updatedAt || now
  };
}

function seedMemory() {
  if (memory.size) return;
  starterWorkbooks().forEach((workbook) => {
    const enriched = enrich(workbook);
    memory.set(enriched.id, enriched);
  });
}

function publicWorkbook(workbook) {
  const data = typeof workbook.toJSON === 'function' ? workbook.toJSON() : workbook;
  return enrich(data);
}

export async function listWorkbooks() {
  if (isMongoReady()) {
    const docs = await Workbook.find({}).sort({ updatedAt: -1 }).limit(40);
    return docs.map(publicWorkbook);
  }

  seedMemory();
  return [...memory.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getWorkbook(id) {
  if (isMongoReady()) {
    const doc = await Workbook.findById(id);
    return doc ? publicWorkbook(doc) : null;
  }

  seedMemory();
  return memory.get(id) || null;
}

export async function createWorkbook(payload) {
  const workbook = enrich(payload);
  workbook.activity.formulaCells = countFormulaCells(workbook.grid);

  if (isMongoReady()) {
    const doc = await Workbook.create(workbook);
    return publicWorkbook(doc);
  }

  memory.set(workbook.id, workbook);
  return workbook;
}

export async function updateWorkbook(id, payload) {
  const current = await getWorkbook(id);
  if (!current) return null;

  const next = enrich({
    ...current,
    ...payload,
    id,
    grid: payload.grid ? normalizeGrid(payload.grid) : current.grid,
    activity: {
      ...current.activity,
      ...payload.activity
    },
    updatedAt: new Date().toISOString()
  });
  next.activity.formulaCells = countFormulaCells(next.grid);

  if (isMongoReady()) {
    const doc = await Workbook.findByIdAndUpdate(id, next, { returnDocument: 'after' });
    return doc ? publicWorkbook(doc) : null;
  }

  memory.set(id, next);
  return next;
}

export async function deleteWorkbook(id) {
  if (isMongoReady()) {
    const doc = await Workbook.findByIdAndDelete(id);
    return Boolean(doc);
  }

  seedMemory();
  return memory.delete(id);
}
