# AI Configuration and Troubleshooting

Vectorsheets supports three generation modes:

1. Cloud AI through Azure OpenAI.
2. Cloud AI through OpenAI.
3. Local deterministic workbook generation.

The client never receives AI credentials. All provider configuration stays in the server environment.

## Runtime Status

Check the current provider and runtime:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' | Select-Object -ExpandProperty ai | ConvertTo-Json -Depth 8
```

Important fields:

- `configured`: whether a cloud provider appears configured.
- `provider`: `azure-openai`, `openai`, or `deterministic`.
- `auth`: `api-key`, `bearer`, `entra`, or `none`.
- `runtime`: `not-tested`, `ai-engine`, `fallback-engine`, or `local-engine`.
- `lastError`: most recent cloud AI error if fallback was used.

## Azure OpenAI: API Key

Use this when you have an Azure OpenAI resource endpoint and API key:

```text
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_AUTH_MODE=key
AZURE_OPENAI_API_KEY=your-key
```

The app posts to:

```text
<AZURE_OPENAI_ENDPOINT>/responses
```

If the endpoint does not already include `/openai/v1`, the server builds:

```text
<AZURE_OPENAI_ENDPOINT>/openai/v1/responses
```

## Azure OpenAI: Bearer Token

```text
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_AUTH_MODE=bearer
AZURE_OPENAI_BEARER_TOKEN=your-token
```

## Azure OpenAI: DefaultAzureCredential

```text
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_AUTH_MODE=entra
AZURE_OPENAI_TOKEN_SCOPE=https://ai.azure.com/.default
```

Use this only when the machine or hosting environment has a valid Azure identity with access to the model resource.

## OpenAI Responses API

```text
AI_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o-mini
```

Optional:

```text
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
```

## Fallback Behavior

If cloud generation fails, Vectorsheets returns a local workbook instead of breaking the product. The API response includes:

```json
{
  "source": "fallback-engine",
  "fallbackReason": "Cloud AI was unavailable (...), so the local workbook engine was used."
}
```

The UI shows `Local AI fallback` after this happens.

## Troubleshooting

### Azure 401: Invalid Subscription Key Or Wrong Endpoint

Meaning:

- The key is not valid for the endpoint.
- The endpoint points to the wrong Azure resource.
- The deployment name does not exist under that resource.
- The endpoint is an AI Foundry endpoint but the key belongs to a different resource.

Fix:

1. Confirm the exact Azure resource endpoint.
2. Confirm the deployment name.
3. Rotate or copy the API key from the same Azure resource.
4. Set `AZURE_OPENAI_AUTH_MODE=key`.
5. Restart the server.

### DefaultAzureCredential Token Chain Failure

Meaning:

- The server tried Entra auth but the local machine has no usable Azure identity.

Fix:

- Use `AZURE_OPENAI_AUTH_MODE=key` with `AZURE_OPENAI_API_KEY`, or
- Log in/configure Azure identity and use `AZURE_OPENAI_AUTH_MODE=entra`.

### Cloud AI Returns Invalid JSON

The server validates AI output against a strict workbook schema. If output is invalid, fallback generation is used. Check `vectorsheets-host.err` or the API response `fallbackReason`.

### No Cloud Provider Configured

The app uses the local deterministic workbook engine and reports:

```text
provider: deterministic
runtime: local-engine
```
