import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { z } from 'zod';
import { buildWorkbook, generateWorkbookFromPrompt } from './generator.js';

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const aiWorkbookSchema = z.object({
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(12).max(1200),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
  headers: z.array(z.string().trim().min(1).max(48)).min(2).max(12),
  rows: z.array(z.array(cellSchema).min(1).max(12)).min(2).max(35),
  formulas: z
    .array(
      z.object({
        ref: z.string().regex(/^[A-L](?:[1-9]|[1-2]\d|3[0-6])$/i),
        formula: z.string().trim().startsWith('=').max(180)
      })
    )
    .max(80)
    .default([]),
  chart: z
    .object({
      type: z.enum(['bar', 'line', 'none']),
      labelColumn: z.number().int().min(0).max(11),
      valueColumn: z.number().int().min(0).max(11),
      title: z.string().trim().max(120)
    })
    .default({ type: 'none', labelColumn: 0, valueColumn: 1, title: '' })
});

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'summary', 'tags', 'headers', 'rows', 'formulas', 'chart'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    summary: { type: 'string', minLength: 12, maxLength: 1200 },
    tags: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 32 }
    },
    headers: {
      type: 'array',
      minItems: 2,
      maxItems: 12,
      items: { type: 'string', minLength: 1, maxLength: 48 }
    },
    rows: {
      type: 'array',
      minItems: 2,
      maxItems: 35,
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: { type: 'string' }
      }
    },
    formulas: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'formula'],
        properties: {
          ref: { type: 'string', pattern: '^[A-L](?:[1-9]|[1-2][0-9]|3[0-6])$' },
          formula: { type: 'string', minLength: 2, maxLength: 180 }
        }
      }
    },
    chart: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'labelColumn', 'valueColumn', 'title'],
      properties: {
        type: { type: 'string', enum: ['bar', 'line', 'none'] },
        labelColumn: { type: 'integer', minimum: 0, maximum: 11 },
        valueColumn: { type: 'integer', minimum: 0, maximum: 11 },
        title: { type: 'string', maxLength: 120 }
      }
    }
  }
};

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45000);

let azureTokenProvider = null;
let lastAiRuntime = {
  runtime: 'not-tested',
  lastError: ''
};

function env(name) {
  return process.env[name]?.trim() || '';
}

function firstLine(value) {
  return String(value || '').split('\n')[0];
}

function responsesUrl() {
  const explicit = env('AZURE_OPENAI_RESPONSES_URL');
  if (explicit) {
    return explicit.endsWith('/responses') ? explicit : `${explicit.replace(/\/+$/, '')}/responses`;
  }

  const endpoint = env('AZURE_OPENAI_ENDPOINT');
  if (!endpoint) return '';

  const base = endpoint.replace(/\/+$/, '');
  if (base.endsWith('/responses')) return base;
  if (base.endsWith('/openai/v1') || base.endsWith('/v1')) return `${base}/responses`;
  return `${base}/openai/v1/responses`;
}

function openAiBaseUrl() {
  const endpoint = env('AZURE_OPENAI_ENDPOINT');
  if (endpoint) return endpoint.replace(/\/+$/, '');

  const explicit = env('AZURE_OPENAI_RESPONSES_URL');
  if (explicit) return explicit.replace(/\/responses\/?$/, '').replace(/\/+$/, '');

  return '';
}

function openAiResponsesUrl() {
  const explicit = env('OPENAI_RESPONSES_URL');
  if (explicit) return explicit.endsWith('/responses') ? explicit : `${explicit.replace(/\/+$/, '')}/responses`;

  const base = env('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
  return `${base.replace(/\/+$/, '')}/responses`;
}

function azureAuthMode() {
  const requested = env('AZURE_OPENAI_AUTH_MODE').toLowerCase();
  const apiKey = env('AZURE_OPENAI_API_KEY');
  const bearerToken = env('AZURE_OPENAI_BEARER_TOKEN');

  if (['entra', 'aad', 'managed-identity', 'default-credential'].includes(requested)) return 'entra';
  if (['bearer', 'access-token'].includes(requested)) return bearerToken ? 'bearer' : apiKey ? 'api-key' : 'entra';
  if (requested === 'token') return bearerToken ? 'bearer' : apiKey ? 'api-key' : 'entra';
  if (['key', 'api-key', 'apikey'].includes(requested)) return 'api-key';
  if (apiKey) return 'api-key';
  if (bearerToken) return 'bearer';
  return 'entra';
}

function selectedProvider() {
  const requested = env('AI_PROVIDER').toLowerCase();
  if (requested === 'openai') return env('OPENAI_API_KEY') ? 'openai' : 'deterministic';
  if (requested === 'azure' || requested === 'azure-openai') return responsesUrl() ? 'azure-openai' : 'deterministic';
  if (responsesUrl()) return 'azure-openai';
  if (env('OPENAI_API_KEY')) return 'openai';
  return 'deterministic';
}

export function aiConfig() {
  const provider = selectedProvider();
  const auth = provider === 'azure-openai' ? azureAuthMode() : provider === 'openai' ? 'api-key' : 'none';
  const model =
    provider === 'openai'
      ? env('OPENAI_MODEL') || 'gpt-4o-mini'
      : env('AZURE_OPENAI_DEPLOYMENT') || env('AZURE_OPENAI_MODEL') || 'gpt-4o-mini';
  const configured = Boolean(
    (provider === 'openai' && env('OPENAI_API_KEY')) ||
      (provider === 'azure-openai' &&
        responsesUrl() &&
        ((auth === 'api-key' && env('AZURE_OPENAI_API_KEY')) ||
          (auth === 'bearer' && env('AZURE_OPENAI_BEARER_TOKEN')) ||
          auth === 'entra'))
  );

  return {
    configured,
    provider: configured ? provider : 'deterministic',
    model,
    endpoint:
      provider === 'openai'
        ? openAiResponsesUrl()
          ? 'configured'
          : 'missing'
        : responsesUrl() || openAiBaseUrl()
          ? 'configured'
          : 'missing',
    auth
  };
}

export function aiRuntimeConfig() {
  return {
    ...aiConfig(),
    ...lastAiRuntime
  };
}

async function azureAuthHeaders(config) {
  const auth = config.auth;

  if (auth === 'api-key') {
    const apiKey = env('AZURE_OPENAI_API_KEY');
    if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY is required for Azure API-key auth.');
    return { 'api-key': apiKey };
  }

  if (auth === 'bearer') {
    const token = env('AZURE_OPENAI_BEARER_TOKEN');
    if (!token) throw new Error('AZURE_OPENAI_BEARER_TOKEN is required for Azure bearer-token auth.');
    return { Authorization: `Bearer ${token}` };
  }

  azureTokenProvider ||= getBearerTokenProvider(
    new DefaultAzureCredential(),
    env('AZURE_OPENAI_TOKEN_SCOPE') || 'https://ai.azure.com/.default'
  );
  const token = await azureTokenProvider();
  return { Authorization: `Bearer ${token}` };
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || text || `HTTP ${response.status}`;
      throw new Error(`${response.status} ${firstLine(message)}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function parseOutputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;

  const chunks = [];
  for (const item of body?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.json === 'object') return JSON.stringify(content.json);
    }
  }

  return chunks.join('\n').trim();
}

function workbookFromAiPayload(payload, prompt) {
  const parsed = aiWorkbookSchema.parse(payload);
  const formulas = Object.fromEntries(parsed.formulas.map((item) => [item.ref.toUpperCase(), item.formula]));

  return buildWorkbook({
    name: parsed.name,
    prompt,
    headers: parsed.headers,
    rows: parsed.rows,
    formulas,
    summary: parsed.summary,
    chart: {
      type: parsed.chart.type,
      labelColumn: Math.min(parsed.headers.length - 1, parsed.chart.labelColumn),
      valueColumn: Math.min(parsed.headers.length - 1, parsed.chart.valueColumn),
      title: parsed.chart.title
    },
    tags: [...new Set(['ai-native', ...parsed.tags])].slice(0, 8)
  });
}

async function generateWithAzure(prompt) {
  const config = aiConfig();
  if (!config.configured || config.provider !== 'azure-openai') return null;

  return generateWithResponses(prompt, config);
}

async function generateWithOpenAI(prompt) {
  const config = aiConfig();
  if (!config.configured || config.provider !== 'openai') return null;

  return generateWithResponses(prompt, config);
}

async function generateWithResponses(prompt, config) {
  const request = {
    model: config.model,
    temperature: 0.2,
    max_output_tokens: 2800,
    instructions:
      'You are the Vectorsheets workbook engine. Build serious business workbooks, not prose. Return only a valid JSON workbook. Use formulas wherever totals, rates, variances, scores, projections, or scenario rows can be computed. Keep labels concise. Prefer inspectable assumptions over hidden logic. Use rows as data rows only because headers are provided separately.',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Create an editable spreadsheet model for this request:\n\n${prompt}`
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'vectorsheets_workbook',
        strict: true,
        schema: responseSchema
      }
    }
  };

  const url = config.provider === 'openai' ? openAiResponsesUrl() : responsesUrl();
  const headers =
    config.provider === 'openai'
      ? { Authorization: `Bearer ${env('OPENAI_API_KEY')}` }
      : await azureAuthHeaders(config);
  const body = await postJson(url, headers, request);
  const outputText = parseOutputText(body);
  if (!outputText) throw new Error(`${config.provider} generation returned no workbook payload.`);

  return workbookFromAiPayload(JSON.parse(outputText), prompt);
}

export async function generateWorkbook(prompt) {
  try {
    const workbook = (await generateWithAzure(prompt)) || (await generateWithOpenAI(prompt));
    if (workbook) {
      lastAiRuntime = {
        runtime: 'ai-engine',
        lastError: ''
      };
      return {
        workbook: {
          ...workbook,
          status: 'AI generated workbook',
          activity: {
            ...workbook.activity,
            lastAction: 'Generated by Vector AI'
          }
        },
        source: 'ai-engine'
      };
    }
  } catch (error) {
    const message = firstLine(error.message || error);
    console.warn(`[vectorsheets] AI engine fallback: ${message}`);
    lastAiRuntime = {
      runtime: 'fallback-engine',
      lastError: message
    };
    return {
      workbook: generateWorkbookFromPrompt(prompt),
      source: 'fallback-engine',
      fallbackReason: `Cloud AI was unavailable (${message}), so the local workbook engine was used.`
    };
  }

  lastAiRuntime = {
    runtime: 'local-engine',
    lastError: ''
  };
  return {
    workbook: generateWorkbookFromPrompt(prompt),
    source: 'local-engine'
  };
}
