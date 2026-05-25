const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...jsonHeaders,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  health: () => request('/api/health'),
  listWorkbooks: () => request('/api/workbooks'),
  createWorkbook: (payload) =>
    request('/api/workbooks', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateWorkbook: (id, payload) =>
    request(`/api/workbooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteWorkbook: (id) =>
    request(`/api/workbooks/${id}`, {
      method: 'DELETE'
    }),
  generate: (payload) =>
    request('/api/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
