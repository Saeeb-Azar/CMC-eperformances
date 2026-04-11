const BASE = '/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),

  // Machines
  listMachines: () => request('/machines'),
  getMachineStatus: (id: string) => request(`/machines/${id}/status`),

  // Orders
  listOrders: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/orders${qs}`);
  },
  getActiveOrders: (machineId: string) =>
    request(`/orders/active?machine_id=${machineId}`),
  getOrder: (id: string) => request(`/orders/${id}`),
  resolveOrder: (id: string, data: { resolution_reason: string; tracking_number?: string }) =>
    request(`/orders/${id}/resolve`, { method: 'POST', body: JSON.stringify(data) }),

  // Analytics
  dashboard: () => request('/analytics/dashboard'),
  throughput: (hours = 24) => request(`/analytics/throughput?hours=${hours}`),
  dimensions: (days = 7) => request(`/analytics/dimensions?days=${days}`),
  weights: (days = 7) => request(`/analytics/weights?days=${days}`),
  rejects: (days = 7) => request(`/analytics/rejects?days=${days}`),
  timings: (days = 7) => request(`/analytics/timings?days=${days}`),

  // Audit
  auditLogs: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/audit${qs}`);
  },
};
