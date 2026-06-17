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
      localStorage.removeItem('cmc.loginAt');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json() as Promise<T>;
}

// Produkt-Stammdaten zu einem EAN (weclapp; source "pulpo" = nur Name aus
// dem Queue-Cache). image_url ist ein Backend-Proxy-Pfad (Auth-Header).
export interface ProductInfo {
  ean: string; article_id: string; name: string; sku: string;
  description: string; unit: string; has_image: boolean;
  source: 'weclapp' | 'pulpo'; image_url: string | null;
}

/** Absolute URL zum Artikelbild-Proxy (für <img src>). */
export function productImageUrl(ean: string): string {
  return `${BASE}/products/${encodeURIComponent(ean)}/image`;
}

export interface PackageDetails {
  reference_id: string;
  barcode: string;
  order: null | {
    state: string; barcode: string; machine_db_id: string;
    dimensions: { length_mm: number | null; width_mm: number | null; height_mm: number | null };
    weight_g: number | null; rejection_reason: string | null; created_at: string | null;
  };
  dhl: null | {
    tracking_number: string; carrier: string; product: string;
    label_format: string; label_b64: string; has_label: boolean;
    printed_at: string | null; print_error: string; is_test: boolean;
    recipient: { name: string; zip: string; city: string; country: string };
    weight_g: number;
  };
  pulpo: null | {
    packing_order_number: string; packing_order_id: number | null;
    sales_order_number: string; shipment_method: string; state: string;
    recipient: {
      name: string; company: string; phone: string; street: string;
      house_nr: string; street2: string; zip: string; city: string;
      country: string; email: string;
    };
    items: Array<{ name: string; sku: string; ean: string; quantity: number; weclapp_article_id: string }>;
  };
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
  pulpo_pick_location: string;
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
  pulpo_pick_location?: string;
}

export type MachineUpdateInput = Partial<Omit<MachineCreateInput, 'machine_id'>> & {
  is_active?: boolean;
};

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
  updateMachine: (id: string, data: MachineUpdateInput) =>
    request<MachineRead>(`/machines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteMachine: (id: string) =>
    request<{ ok: boolean }>(`/machines/${id}`, { method: 'DELETE' }),

  // „Manuell ausgeworfen" — Notausstieg für hängende Aufträge.
  manualEjectOrder: (orderId: string, reason: string) =>
    request<OrderStateRead>(`/orders/${encodeURIComponent(orderId)}/manual-eject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  getMachineStatus: (id: string) => request<MachineStatusRead>(`/machines/${id}/status`),
  getGatewayStatus: () => request<{
    listening: boolean; port: number; connected_machines: string[];
    pending_connections?: number; public_tcp_address?: string;
  }>('/gateway/status'),
  getNotifications: () => request<{ count: number; notifications: Array<{ id: string; severity: string; days_left: number; title: string; message: string }> }>('/notifications'),

  // Pulpo settings — Test-Modus = no writes reach Pulpo
  getPulpoSettings: () => request<{ test_mode: boolean; write_enabled: boolean; replay_writes: boolean }>('/settings/pulpo'),
  setPulpoWriteback: (enabled: boolean) =>
    request<{ ok: boolean; write_enabled: boolean; test_mode: boolean; replay_writes: boolean }>(
      '/settings/pulpo/writeback', { method: 'PUT', body: JSON.stringify({ enabled }) },
    ),
  getPulpoStatus: () => request<{
    test_mode: boolean; write_enabled: boolean; replay_writes: boolean;
    configured: boolean; last_sync_at: string | null;
    last_sync_error: string | null; last_sync_error_at: string | null;
    open_orders: number; barcodes: number;
    locations: Record<string, number>; cache_locations: Record<string, number>;
  }>('/settings/pulpo/status'),
  triggerPulpoResync: () =>
    request<{ ok: boolean; orders?: number; locations?: Record<string, number>; error?: string }>(
      '/settings/pulpo/resync', { method: 'POST' },
    ),

  // Produkt-Stammdaten (weclapp, Fallback Pulpo-Cache) für die Produktkarten
  // DHL Parcel DE — Versandlabel-Anbindung
  getDhlStatus: () => request<{
    test_mode: boolean; configured: boolean; base_url: string;
    billing_number_set: boolean;
    last_label_at: string | null; last_label_tracking: string;
    last_error: string | null; last_error_at: string | null;
    shipments_total: number; shipments_live: number;
    precreate_total: number; precreate_ok: number;
    precreate_last_msg: string; precreate_last_at: string | null;
    print_queue_open: number; print_problems: number;
    daemon_last_seen: string | null;
  }>('/settings/dhl/status'),
  getPrintProblems: () => request<Array<{
    id: string; reference_id: string; tracking_number: string;
    print_error: string; created_at: string;
  }>>('/print-queue/problems'),
  // Druckqueue für den Browser-Druck-Agenten (QZ Tray) — gleiche Endpunkte
  // wie der optionale LAN-Daemon, nur aus dem offenen Dashboard-Tab bedient.
  getPrintQueue: () => request<Array<{
    id: string; reference_id: string; tracking_number: string;
    label_b64: string; label_format: string; created_at: string;
  }>>('/print-queue'),
  markPrinted: (shipmentId: string, error?: string | null) =>
    request<{ ok: boolean; printed: boolean }>(
      `/print-queue/${encodeURIComponent(shipmentId)}/mark-printed`,
      { method: 'POST', body: JSON.stringify({ error: error ?? null }) },
    ),
  // Druck-Probleme aufräumen / erneut versuchen.
  retryPrint: (shipmentId: string) =>
    request<{ ok: boolean; requeued: boolean }>(
      `/print-queue/${encodeURIComponent(shipmentId)}/retry`, { method: 'POST' },
    ),
  deletePrintEntry: (shipmentId: string) =>
    request<{ ok: boolean; deleted: number }>(
      `/print-queue/${encodeURIComponent(shipmentId)}`, { method: 'DELETE' },
    ),
  clearPrintProblems: () =>
    request<{ ok: boolean; deleted: number }>(
      `/print-queue/problems`, { method: 'DELETE' },
    ),
  // ALLE Backend-Logs (Ringpuffer) — fürs Live-Debugging im Dashboard.
  getLogs: (params?: { limit?: number; level?: string; since_id?: number; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.level) qs.set('level', params.level);
    if (params?.since_id) qs.set('since_id', String(params.since_id));
    if (params?.q) qs.set('q', params.q);
    const s = qs.toString();
    return request<{
      logs: Array<{ id: number; timestamp: string; level: string; logger: string; module: string; message: string; exception?: string }>;
      count: number; last_id: number;
    }>(`/logs/recent${s ? `?${s}` : ''}`);
  },
  // Voll-Detailansicht zu einem Paket (DHL + Pulpo + Empfänger + Artikel).
  getPackageDetails: (ref: string) =>
    request<PackageDetails>(`/packages/${encodeURIComponent(ref)}/details`),
  setDhlSettings: (test_mode: boolean) =>
    request<{ ok: boolean; test_mode: boolean }>('/settings/dhl', {
      method: 'PUT', body: JSON.stringify({ test_mode }),
    }),
  createTestLabel: (body: {
    weight_g: number; length_mm: number; width_mm: number; height_mm: number;
    recipient_name?: string; recipient_street?: string; recipient_street_no?: string;
    recipient_zip?: string; recipient_city?: string; recipient_country?: string;
    order_ref?: string; product?: string;
  }) => request<{
    tracking_number: string; label_format: string; label_b64_length: number;
    is_test: boolean; created_at: string;
  }>('/shipments/test-label', { method: 'POST', body: JSON.stringify(body) }),

  lookupProducts: (eans: string[]) =>
    request<{ products: Record<string, ProductInfo | null>; weclapp_configured: boolean }>(
      '/products/lookup', { method: 'POST', body: JSON.stringify({ eans }) },
    ),
  setPulpoSettings: (test_mode: boolean) =>
    request<{ ok: boolean; test_mode: boolean }>('/settings/pulpo', {
      method: 'PUT',
      body: JSON.stringify({ test_mode }),
    }),

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

  // Demo / Test — kompletter simulierter Durchlauf ohne Maschine/Lager.
  demoStatus: () => request<DemoStatus>('/demo/status'),
  demoRun: (body: DemoRunRequest) =>
    request<DemoRunResult>('/demo/run', { method: 'POST', body: JSON.stringify(body) }),
  demoCleanup: () =>
    request<{ ok: boolean; removed: { packing_orders: number; shipments: number; order_states: number } }>(
      '/demo/cleanup', { method: 'POST' },
    ),
  // DRY-RUN: prüft mit echten Pulpo-Daten die Zuordnung — read-only, nichts gespeichert/versendet.
  demoDryRun: (machine_id: string, barcodes: string[], cw_list = '') =>
    request<DryRunResponse>('/demo/dry-run-scan', {
      method: 'POST', body: JSON.stringify({ machine_id, barcodes, cw_list }),
    }),
  // Pulpo-Write-Verifikation: feuert GENAU einen Pulpo-Call, gibt Status/422-Body zurück.
  pulpoProbe: (body: {
    step: string; packing_order_id?: string; box_id?: string;
    sales_order_id?: string; confirm?: boolean; params?: Record<string, unknown>;
  }) => request<PulpoProbeResult>('/settings/pulpo/probe', {
    method: 'POST', body: JSON.stringify(body),
  }),
};

export interface PulpoProbeResult {
  ok: boolean; step?: string; status_code?: number; error?: string;
  body?: unknown; result?: unknown; read?: string[]; write?: string[];
}

export interface DryRunResult {
  index: number; scanned: string; barcode: string; reference_id: string;
  cw_list?: string; status: string; reason?: string; note?: string;
  packing_order?: string; sales_order?: string; pulpo_order_id?: string;
  tracking?: string; article?: string; label_preview_b64?: string;
  recipient?: {
    name: string; street: string; house_nr: string; zip: string;
    city: string; country: string; email: string; phone: string;
  } | null;
}
export interface DryRunResponse {
  ok: boolean; machine_id: string; count: number; note: string;
  results: DryRunResult[];
}

export interface DemoStatus {
  pulpo_test_mode: boolean;
  dhl_test_mode: boolean;
  gateway_port: number;
  demo_machine_id: string;
  open_test_orders: number;
}

export interface DemoRunRequest {
  product_name: string;
  product_sku: string;
  product_ean: string;
  product_image_url?: string;
  quantity: number;
  barcode?: string;
  recipient: {
    name: string; company?: string; street: string; house_nr: string;
    zip: string; city: string; country: string; email?: string; phone?: string;
  };
  weight_g: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

export interface DemoRunResult {
  ok: boolean;
  error: string;
  reference_id: string;
  barcode: string;
  machine_id: string;
  packing_order: string;
  order_state: { state: string; is_test: boolean } | null;
  shipment: {
    tracking_number: string; label_format: string;
    has_label: boolean; is_test: boolean;
  } | null;
  steps: Array<{ sent: string; reply: string }>;
}
