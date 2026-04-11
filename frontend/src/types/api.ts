// Auth
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'tenant_admin' | 'operator' | 'viewer';
  is_active: boolean;
  tenant_id: string;
  last_login: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

// Machine
export interface Machine {
  id: string;
  tenant_id: string;
  machine_id: string;
  name: string;
  model: string;
  tcp_host: string;
  tcp_port: number;
  lab1_enabled: boolean;
  lab2_enabled: boolean;
  inv_enabled: boolean;
  status: 'STOP' | 'RUNNING' | 'PAUSE' | 'ERROR';
  is_online: boolean;
  is_active: boolean;
  enq_sequence: number;
  last_heartbeat_at: string | null;
  last_event_at: string | null;
  created_at: string;
}

export interface MachineStatus {
  machine_id: string;
  status: string;
  is_online: boolean;
  last_heartbeat_at: string | null;
  uptime_percent_24h: number | null;
  total_heartbeats_24h: number;
}

// Orders
export type OrderStateType =
  | 'ASSIGNED' | 'INDUCTED' | 'SCANNED' | 'LABELED'
  | 'COMPLETED' | 'FAILED' | 'EJECTED' | 'DELETED';

export interface OrderState {
  id: string;
  reference_id: string;
  barcode: string;
  state: OrderStateType;
  enq_sequence: number;
  dimension_height_mm: number | null;
  dimension_length_mm: number | null;
  dimension_width_mm: number | null;
  lab1_weight_scale: number | null;
  final_weight_g: number | null;
  tracking_number: string | null;
  carrier: string | null;
  label_type: string | null;
  ejection_reason: string | null;
  enq_at: string | null;
  ind_at: string | null;
  ack_at: string | null;
  lab1_at: string | null;
  end_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// Analytics
export interface DashboardOverview {
  total_orders_today: number;
  completed_today: number;
  failed_today: number;
  ejected_today: number;
  active_on_conveyor: number;
  success_rate_percent: number;
  reject_rate_percent: number;
  avg_processing_time_seconds: number | null;
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

export interface StationTiming {
  station_from: string;
  station_to: string;
  avg_seconds: number;
  min_seconds: number;
  max_seconds: number;
  sample_count: number;
}

export interface RejectAnalysis {
  reason: string;
  count: number;
  percentage: number;
}

// Audit
export interface AuditLogEntry {
  id: string;
  event_type: string;
  category: string;
  actor_type: string;
  actor_id: string | null;
  machine_id: string | null;
  reference_id: string | null;
  previous_state: string | null;
  new_state: string | null;
  detail: string | null;
  response_time_ms: number | null;
  timestamp: string;
}
