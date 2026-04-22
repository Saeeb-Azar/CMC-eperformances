// Backend URL: prefer runtime env.js injected at deploy time, fall back to the
// Vite build-time env var, then to same-origin (works in local dev behind a
// Vite proxy). Same resolution logic as SimulatorPage so every request goes
// to the actual backend instead of the SPA's index.html.
const _env = (window as unknown as Record<string, unknown>).__ENV__ as
  | Record<string, string>
  | undefined;
let API_HOST = (_env?.VITE_API_URL || import.meta.env.VITE_API_URL || '')
  .split(',')[0]
  .trim();
if (API_HOST && !API_HOST.startsWith('http')) {
  API_HOST = `https://${API_HOST}`;
}
const BASE = `${API_HOST}/api/v1`;

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
    // Expired/invalid token → kick the user back to the login page so they
    // don't stare at silently failing panels.
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────
export interface UserRead {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  tenant_id: string;
  last_login: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserRead;
}

export interface MachineRead {
  id: string;
  tenant_id: string;
  machine_id: string;
  name: string;
  model: string;
  tcp_role: string;
  tcp_host: string;
  tcp_port: number;
  lab1_enabled: boolean;
  lab2_enabled: boolean;
  inv_enabled: boolean;
  pre_create_labels: boolean;
  max_length_mm: number;
  max_width_mm: number;
  max_height_mm: number;
  status: string;
  is_online: boolean;
  is_active: boolean;
  enq_sequence: number;
  last_heartbeat_at: string | null;
  last_event_at: string | null;
  created_at: string;
}

export interface MachineStatusRead {
  machine_id: string;
  status: string;
  is_online: boolean;
  last_heartbeat_at: string | null;
  uptime_percent_24h: number | null;
  total_heartbeats_24h: number;
}

export interface MachineCreateInput {
  machine_id: string;
  name: string;
  model?: string;
  tcp_role?: 'server' | 'client';
  tcp_host?: string;
  tcp_port?: number;
  lab1_enabled?: boolean;
  lab2_enabled?: boolean;
  inv_enabled?: boolean;
  pre_create_labels?: boolean;
  max_length_mm?: number;
  max_width_mm?: number;
  max_height_mm?: number;
}

export interface OrderStateListItem {
  id: string;
  reference_id: string;
  barcode: string;
  state: string;
  enq_sequence: number;
  tracking_number: string | null;
  carrier: string | null;
  final_weight_g: number | null;
  ejection_reason: string | null;
  enq_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface OrderStateRead extends OrderStateListItem {
  tenant_id: string;
  machine_db_id: string;
  dimension_height_mm: number | null;
  dimension_length_mm: number | null;
  dimension_width_mm: number | null;
  lab1_weight_scale: number | null;
  lab1_weight_carton: number | null;
  lab1_weight_content: number | null;
  final_length_mm: number | null;
  final_width_mm: number | null;
  final_height_mm: number | null;
  label_type: string | null;
  label_pre_created: boolean;
  lab1_enabled: boolean;
  lab2_enabled: boolean;
  inv_enabled: boolean;
  inv_printed: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  ind_at: string | null;
  ack_at: string | null;
  inv_at: string | null;
  lab1_at: string | null;
  lab2_at: string | null;
  end_at: string | null;
}

export interface DashboardOverview {
  total_orders_today: number;
  completed_today: number;
  failed_today: number;
  ejected_today: number;
  active_on_conveyor: number;
  success_rate_percent: number;
  reject_rate_percent: number;
  avg_processing_time_seconds: number | null;
  avg_label_generation_ms: number | null;
  machines_online: number;
  machines_total: number;
}

export interface ThroughputData {
  timestamp: string;
  completed: number;
  failed: number;
  ejected: number;
  total: number;
}

export interface DimensionStats {
  avg_height_mm: number | null;
  avg_length_mm: number | null;
  avg_width_mm: number | null;
  min_height_mm: number | null;
  max_height_mm: number | null;
  min_length_mm: number | null;
  max_length_mm: number | null;
  min_width_mm: number | null;
  max_width_mm: number | null;
  total_measured: number;
}

export interface WeightStats {
  avg_weight_scale_g: number | null;
  avg_weight_carton_g: number | null;
  avg_weight_content_g: number | null;
  min_weight_g: number | null;
  max_weight_g: number | null;
  total_weighed: number;
}

export interface RejectAnalysis {
  reason: string;
  count: number;
  percentage: number;
}

export interface StationTiming {
  station_from: string;
  station_to: string;
  avg_seconds: number;
  min_seconds: number;
  max_seconds: number;
  sample_count: number;
}

export interface AuditLogRead {
  id: string;
  tenant_id: string;
  event_type: string;
  category: string;
  actor_type: string;
  actor_id: string | null;
  machine_id: string | null;
  reference_id: string | null;
  order_id: string | null;
  previous_state: string | null;
  new_state: string | null;
  detail: string | null;
  response_time_ms: number | null;
  timestamp: string;
}

export interface TenantRead {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan: string;
  created_at: string;
}

export interface GatewayStatus {
  listening: boolean;
  port: number;
  connected_machines: string[];
  websocket_clients: number;
}

// ── API ──────────────────────────────────────────────────────────────────
export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<UserRead>('/auth/me'),
  listUsers: () => request<UserRead[]>('/auth/users'),

  // Machines
  listMachines: () => request<MachineRead[]>('/machines'),
  createMachine: (data: MachineCreateInput) =>
    request<MachineRead>('/machines', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMachineStatus: (id: string) => request<MachineStatusRead>(`/machines/${id}/status`),

  // Orders
  listOrders: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<OrderStateListItem[]>(`/orders${qs}`);
  },
  getActiveOrders: (machineId: string) =>
    request<OrderStateRead[]>(`/orders/active?machine_id=${machineId}`),
  getOrder: (id: string) => request<OrderStateRead>(`/orders/${id}`),
  resolveOrder: (id: string, data: { resolution_reason: string; tracking_number?: string }) =>
    request<OrderStateRead>(`/orders/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Analytics
  dashboard: () => request<DashboardOverview>('/analytics/dashboard'),
  throughput: (hours = 24) => request<ThroughputData[]>(`/analytics/throughput?hours=${hours}`),
  dimensions: (days = 7) => request<DimensionStats>(`/analytics/dimensions?days=${days}`),
  weights: (days = 7) => request<WeightStats>(`/analytics/weights?days=${days}`),
  rejects: (days = 7) => request<RejectAnalysis[]>(`/analytics/rejects?days=${days}`),
  timings: (days = 7) => request<StationTiming[]>(`/analytics/timings?days=${days}`),

  // Audit
  auditLogs: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<AuditLogRead[]>(`/audit${qs}`);
  },

  // Tenants (control panel)
  listTenants: () => request<TenantRead[]>('/tenants'),

  // Gateway status
  gatewayStatus: () => request<GatewayStatus>('/gateway/status'),
};
