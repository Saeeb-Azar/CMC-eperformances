import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import {
  Wifi, WifiOff,
  ScanBarcode, LogIn, Ruler, Tag, FileText,
  CheckCircle, XCircle, Trash2, Activity,
  Info, Server, ChevronRight, ChevronDown, Search,
} from 'lucide-react';
import PackageStations, {
  type StationId, type StationStatus, STATIONS,
} from '../components/simulator/PackageStations';

interface LiveEvent {
  id: number;
  type: string;
  severity: string;
  message: string;
  machine_id?: string;
  data?: Record<string, unknown>;
  raw?: string;
  timestamp: string;
}

// Runtime config (from env.js) takes priority over build-time (Vite)
const _env = (window as unknown as Record<string, unknown>).__ENV__ as Record<string, string> | undefined;
let API_BASE = (_env?.VITE_API_URL || import.meta.env.VITE_API_URL || '')
  .split(',')[0]  // handle accidental doubled values
  .trim();
if (API_BASE && !API_BASE.startsWith('http')) {
  API_BASE = `https://${API_BASE}`;
}

const typeIcons: Record<string, React.ReactNode> = {
  ENQ: <ScanBarcode size={13} />,
  IND: <LogIn size={13} />,
  ACK: <Ruler size={13} />,
  INV: <FileText size={13} />,
  LAB1: <Tag size={13} />,
  LAB2: <Tag size={13} />,
  END: <CheckCircle size={13} />,
  REM: <Trash2 size={13} />,
  HBT: <Activity size={13} />,
  SYSTEM: <Info size={13} />,
};

const severityColors: Record<string, { bg: string; text: string }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-600' },
  success: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-600' },
  error: { bg: 'bg-red-50', text: 'text-red-600' },
};

// Type chips shown above the feed for quick filtering
const FILTERABLE_TYPES = ['ENQ', 'IND', 'ACK', 'INV', 'LAB1', 'LAB2', 'END', 'REM', 'HBT', 'SYSTEM'];

const POLL_INTERVAL_MS = 1000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function getRef(ev: LiveEvent): string | null {
  const d = ev.data as Record<string, unknown> | undefined;
  if (!d) return null;
  const ref = d.reference_id ?? d.referenceId;
  return typeof ref === 'string' && ref.length > 0 ? ref : null;
}

type PackageState =
  | 'ASSIGNED' | 'INDUCTED' | 'SCANNED' | 'LABELED'
  | 'COMPLETED' | 'FAILED' | 'EJECTED' | 'DELETED';

interface PackageSummary {
  ref: string;
  machineId?: string;
  firstSeen: string;
  lastSeen: string;
  rejected: boolean;
  removed: boolean;
  stations: Record<StationId, StationStatus>;
  currentStation: StationId | null;
  state: PackageState;
}

// Colors mirror the lifecycle in the process documentation: blue for
// in-flight, green for success, red/orange for terminal failures.
const STATE_COLORS: Record<PackageState, { bg: string; fg: string; border: string }> = {
  ASSIGNED:  { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  INDUCTED:  { bg: '#e0e7ff', fg: '#4338ca', border: '#a5b4fc' },
  SCANNED:   { bg: '#cffafe', fg: '#0e7490', border: '#67e8f9' },
  LABELED:   { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  COMPLETED: { bg: '#d1fae5', fg: '#047857', border: '#6ee7b7' },
  FAILED:    { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  EJECTED:   { bg: '#ffedd5', fg: '#9a3412', border: '#fdba74' },
  DELETED:   { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
};

// Derive the package's lifecycle state from the events seen so far.
// Mirrors the State Lifecycle table in the process documentation (Section 4):
//  ENQ accepted → ASSIGNED, IND → INDUCTED, ACK result=1 → SCANNED,
//  LAB1 → LABELED, END status=1 → COMPLETED, END status≠1 → EJECTED,
//  ACK result=0 → EJECTED, REM → DELETED.
function deriveState(stations: Record<StationId, StationStatus>, removed: boolean): PackageState {
  if (removed) return 'DELETED';
  if (stations.exit === 'failed') return 'EJECTED';
  if (stations.exit === 'passed') return 'COMPLETED';
  if (stations.sensor === 'failed') return 'EJECTED';
  if (stations.labeler === 'passed') return 'LABELED';
  if (stations.sensor === 'passed') return 'SCANNED';
  if (stations.induction === 'passed') return 'INDUCTED';
  return 'ASSIGNED';
}

// Apply a single event to the station map. Stations along the way are marked
// passed when a later event arrives, so out-of-order or skipped events still
// produce a sensible position trail.
function applyEventToStations(
  ev: LiveEvent,
  stations: Record<StationId, StationStatus>,
): { rejected: boolean; removed: boolean } {
  const d = ev.data as Record<string, unknown> | undefined;
  let rejected = false;
  let removed = false;

  switch (ev.type) {
    case 'ENQ':
      stations.scanner = 'passed';
      break;
    case 'IND':
      stations.scanner = 'passed';
      stations.induction = 'passed';
      break;
    case 'ACK': {
      stations.scanner = 'passed';
      stations.induction = 'passed';
      const bad = d?.result === '0' || d?.result === 0 || d?.good === false;
      if (bad) {
        stations.sensor = 'failed';
        rejected = true;
      } else {
        stations.sensor = 'passed';
      }
      break;
    }
    case 'LAB1':
    case 'LAB2':
      stations.scanner = 'passed';
      stations.induction = 'passed';
      if (stations.sensor === 'pending') stations.sensor = 'passed';
      stations.wrapper = 'passed';
      stations.labeler = 'passed';
      break;
    case 'END': {
      const status = d?.status;
      const ok = status === '1' || status === 1 || d?.good === true;
      if (ok) stations.exit = 'passed';
      else { stations.exit = 'failed'; rejected = true; }
      break;
    }
    case 'REM':
      removed = true;
      break;
  }
  return { rejected, removed };
}

export default function SimulatorPage() {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connectedMachines, setConnectedMachines] = useState<string[]>([]);
  const [gatewayPort, setGatewayPort] = useState(15001);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [textFilter, setTextFilter] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const sinceIdRef = useRef(0);

  // HTTP polling — the only transport that's guaranteed to work through
  // Railway's proxy. Pulls new events + machine list every second.
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/events/recent?since=${sinceIdRef.current}`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setConnected(true);
        if (Array.isArray(data.connected_machines)) {
          setConnectedMachines(data.connected_machines);
        }
        if (Array.isArray(data.events) && data.events.length > 0) {
          setEvents(prev => [...prev, ...data.events].slice(-500));
        }
        if (typeof data.latest_id === 'number') {
          sinceIdRef.current = data.latest_id;
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    };

    fetch(`${API_BASE}/api/v1/gateway/status`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.port) setGatewayPort(d.port); })
      .catch(() => { /* ignore */ });

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Aggregate package lifecycles for the flow panel
  const packages = useMemo<PackageSummary[]>(() => {
    const map = new Map<string, PackageSummary>();
    for (const ev of events) {
      const ref = getRef(ev);
      if (!ref) continue;
      let pkg = map.get(ref);
      if (!pkg) {
        pkg = {
          ref,
          machineId: ev.machine_id,
          firstSeen: ev.timestamp,
          lastSeen: ev.timestamp,
          rejected: false,
          removed: false,
          stations: {
            scanner: 'pending', induction: 'pending', sensor: 'pending',
            wrapper: 'pending', labeler: 'pending', exit: 'pending',
          },
          currentStation: null,
          state: 'ASSIGNED',
        };
        map.set(ref, pkg);
      }
      pkg.lastSeen = ev.timestamp;
      const result = applyEventToStations(ev, pkg.stations);
      if (result.rejected) pkg.rejected = true;
      if (result.removed) pkg.removed = true;
    }

    // Derive current station: first pending after the latest passed station.
    // Terminal: removed, rejected, or exit reached.
    for (const pkg of map.values()) {
      pkg.state = deriveState(pkg.stations, pkg.removed);
      const terminal = pkg.removed || pkg.rejected || pkg.stations.exit !== 'pending';
      if (terminal) {
        pkg.currentStation = null;
        continue;
      }
      for (const s of STATIONS) {
        if (pkg.stations[s] === 'pending') {
          pkg.stations[s] = 'active';
          pkg.currentStation = s;
          break;
        }
      }
    }

    // Most recent first
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
  }, [events]);

  // Filter the event feed
  const visibleEvents = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    return events.filter(ev => {
      if (typeFilter && ev.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        ev.type,
        ev.message,
        ev.machine_id ?? '',
        ev.raw ?? '',
        getRef(ev) ?? '',
        JSON.stringify(ev.data ?? {}),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [events, typeFilter, textFilter]);

  const stats = useMemo(() => ({
    total: events.filter(e => e.type !== 'SYSTEM').length,
    enq: events.filter(e => e.type === 'ENQ').length,
    end: events.filter(e => e.type === 'END').length,
    hbt: events.filter(e => e.type === 'HBT').length,
  }), [events]);

  const hasSimulator = connectedMachines.length > 0;

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <Topbar title={t('simulator.title')} subtitle={t('simulator.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('simulator.pageTitle')}</h1>
            <p className="page-header__desc">{t('simulator.pageDesc')}</p>
          </div>
        </div>

        <div className="grid-main gap-6">
          {/* Left: Event Feed */}
          <div className="stack-4">
            {/* Stats */}
            <div className="grid-4 gap-4">
              {[
                { label: t('simulator.events'), value: stats.total },
                { label: t('simulator.scans'), value: stats.enq },
                { label: t('simulator.complete'), value: stats.end },
                { label: t('simulator.heartbeats'), value: stats.hbt },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
                  <span className="stat-card__label">{s.label}</span>
                  <span className="stat-card__value">{s.value}</span>
                </div>
              ))}
            </div>

            {/* Event Feed */}
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{t('simulator.liveFeed')}</h3>
                <div className="flex items-center gap-2">
                  {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {connected ? t('common.connected') : t('common.disconnected')}
                  </span>
                  {events.length > 0 && (
                    <button
                      onClick={() => { setEvents([]); setExpanded(new Set()); }}
                      className="btn btn--ghost"
                      style={{ height: 28, fontSize: 11, padding: '0 8px' }}
                    >
                      {t('common.clear')}
                    </button>
                  )}
                </div>
              </div>

              {/* Filter bar: type chips + search */}
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--clr-border)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <button
                  onClick={() => setTypeFilter(null)}
                  className="btn btn--ghost"
                  style={{
                    height: 26, fontSize: 11, padding: '0 10px',
                    background: typeFilter === null ? 'var(--clr-primary-soft)' : undefined,
                    color: typeFilter === null ? 'var(--clr-primary)' : undefined,
                  }}
                >
                  {t('simulator.allTypes')}
                </button>
                {FILTERABLE_TYPES.map(ty => (
                  <button
                    key={ty}
                    onClick={() => setTypeFilter(typeFilter === ty ? null : ty)}
                    className="btn btn--ghost"
                    style={{
                      height: 26, fontSize: 11, padding: '0 10px',
                      fontFamily: 'var(--font-mono)',
                      background: typeFilter === ty ? 'var(--clr-primary-soft)' : undefined,
                      color: typeFilter === ty ? 'var(--clr-primary)' : undefined,
                    }}
                  >
                    {ty}
                  </button>
                ))}
                <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute', left: 8, top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--clr-text-muted)',
                    }}
                  />
                  <input
                    type="text"
                    value={textFilter}
                    onChange={e => setTextFilter(e.target.value)}
                    placeholder={t('simulator.filterPlaceholder')}
                    style={{
                      width: '100%', height: 28, fontSize: 12,
                      padding: '0 8px 0 26px',
                      background: 'var(--clr-surface-sunken)',
                      border: '1px solid var(--clr-border)',
                      borderRadius: 6,
                      color: 'var(--clr-text)',
                    }}
                  />
                </div>
              </div>

              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}></th>
                      <th style={{ width: 40 }}></th>
                      <th style={{ width: 70 }}>Type</th>
                      <th>Event</th>
                      <th style={{ width: 120 }}>Ref</th>
                      <th style={{ width: 110 }} className="!text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEvents.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--clr-text-muted)' }}>
                        {events.length === 0 ? t('simulator.waitingForEvents') : t('orders.noMatch')}
                      </td></tr>
                    ) : (
                      visibleEvents.slice().reverse().map((ev) => {
                        const sev = severityColors[ev.severity] || severityColors.info;
                        const icon = typeIcons[ev.type] || (ev.severity === 'error' ? <XCircle size={13} /> : <Info size={13} />);
                        const time = formatTime(ev.timestamp);
                        const ref = getRef(ev);
                        const isOpen = expanded.has(ev.id);
                        const hasDetails = !!(ev.raw || (ev.data && Object.keys(ev.data).length > 0));
                        return (
                          <Fragment key={ev.id}>
                            <tr
                              onClick={() => hasDetails && toggleExpand(ev.id)}
                              style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                            >
                              <td>
                                {hasDetails && (
                                  <span style={{ color: 'var(--clr-text-muted)' }}>
                                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </span>
                                )}
                              </td>
                              <td>
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${sev.bg} ${sev.text}`}>
                                  {icon}
                                </div>
                              </td>
                              <td><span className="cell-mono">{ev.type}</span></td>
                              <td><span className={ev.type !== 'SYSTEM' ? 'cell-primary' : ''}>{ev.message}</span></td>
                              <td>
                                {ref && (
                                  <span
                                    className="cell-mono"
                                    onClick={(e) => { e.stopPropagation(); setTextFilter(ref); }}
                                    style={{ cursor: 'pointer', color: 'var(--clr-primary)' }}
                                    title={t('common.search')}
                                  >
                                    {ref}
                                  </span>
                                )}
                              </td>
                              <td className="!text-right"><span className="cell-muted tabular-nums">{time}</span></td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={6} style={{ background: 'var(--clr-surface-sunken)', padding: 12 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {ev.machine_id && (
                                      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
                                        {t('audit.machineCol')}: <code className="cell-mono">{ev.machine_id}</code>
                                      </div>
                                    )}
                                    {ev.raw && (
                                      <div>
                                        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 4 }}>
                                          {t('simulator.rawTcp')}
                                        </div>
                                        <pre
                                          style={{
                                            margin: 0, padding: 8, fontSize: 11, lineHeight: 1.5,
                                            background: 'var(--clr-surface)',
                                            border: '1px solid var(--clr-border)',
                                            borderRadius: 6,
                                            color: 'var(--clr-text)',
                                            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                            fontFamily: 'var(--font-mono)',
                                          }}
                                        >
                                          {ev.raw}
                                        </pre>
                                      </div>
                                    )}
                                    {ev.data && Object.keys(ev.data).length > 0 && (
                                      <div>
                                        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 4 }}>
                                          {t('simulator.parsedFields')}
                                        </div>
                                        <table className="table" style={{ fontSize: 11 }}>
                                          <tbody>
                                            {Object.entries(ev.data).map(([k, v]) => (
                                              <tr key={k}>
                                                <td style={{ width: 160, color: 'var(--clr-text-muted)' }}>
                                                  <code className="cell-mono">{k}</code>
                                                </td>
                                                <td>
                                                  <code className="cell-mono">
                                                    {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                                                  </code>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Connection + Package Flow + Setup */}
          <div className="stack-4">
            {/* Connection Status */}
            <div className="hero-panel">
              <div className={`hero-panel__accent ${hasSimulator ? 'hero-panel__accent--success' : connected ? 'hero-panel__accent--active' : 'hero-panel__accent--danger'}`} />
              <div className="flex items-center gap-4 px-8 py-5">
                <div className={hasSimulator ? 'text-emerald-500' : connected ? 'text-blue-500' : 'text-gray-400'}>
                  {hasSimulator ? <Wifi size={22} /> : <WifiOff size={22} />}
                </div>
                <div>
                  <p className="text-lg font-semibold" style={{ color: 'var(--clr-text)' }}>
                    {hasSimulator ? t('simulator.simulatorConnected') : connected ? t('simulator.backendConnected') : t('common.disconnected')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {hasSimulator
                      ? `${connectedMachines.length} Maschine(n) · ${stats.total} ${t('simulator.totalReceived')}`
                      : connected ? t('simulator.noSimulator') : t('simulator.noConnection')}
                  </p>
                </div>
              </div>
            </div>

            {/* Connected machines */}
            {connectedMachines.length > 0 && (
              <div className="panel">
                <div className="panel__header">
                  <h3 className="panel__title">Verbundene Maschinen</h3>
                </div>
                <div className="panel__body">
                  {connectedMachines.map(m => (
                    <div key={m} className="flex items-center gap-3 py-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sm font-mono" style={{ color: 'var(--clr-text)' }}>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Package Flow — shows lifecycle per reference_id */}
            <div className="panel">
              <div className="panel__header">
                <div>
                  <h3 className="panel__title">{t('simulator.packageFlow')}</h3>
                  <p className="text-xs" style={{ color: 'var(--clr-text-muted)', marginTop: 2 }}>
                    {t('simulator.packageFlowDesc')}
                  </p>
                </div>
                {packages.length > 0 && (
                  <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {packages.length}
                  </span>
                )}
              </div>
              <div className="panel__body" style={{ maxHeight: 380, overflowY: 'auto', padding: 0 }}>
                {packages.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--clr-text-muted)', fontSize: 12 }}>
                    {t('simulator.noPackages')}
                  </div>
                ) : (
                  packages.slice(0, 15).map(pkg => {
                    const c = STATE_COLORS[pkg.state];
                    return (
                      <div
                        key={pkg.ref}
                        onClick={() => setTextFilter(pkg.ref)}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--clr-border)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                          <code className="cell-mono" style={{ fontSize: 12, color: 'var(--clr-text)', flexShrink: 0 }}>
                            {pkg.ref}
                          </code>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              fontFamily: 'var(--font-mono)',
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: c.bg,
                              color: c.fg,
                              border: `1px solid ${c.border}`,
                              letterSpacing: 0.3,
                              flexShrink: 0,
                            }}
                          >
                            {t(`status.${pkg.state}`)}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 'auto', flexShrink: 0 }}
                          >
                            {formatTime(pkg.lastSeen)}
                          </span>
                        </div>
                        <PackageStations stations={pkg.stations} removed={pkg.removed} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Setup / connection info — collapsed by default to save space */}
            <div className="panel">
              <button
                onClick={() => setShowSetup(v => !v)}
                className="panel__header"
                style={{
                  width: '100%', cursor: 'pointer', background: 'none', border: 'none',
                  textAlign: 'left', padding: undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <Server size={16} className="text-blue-500" />
                  <h3 className="panel__title">{t('simulator.connectSimulator')}</h3>
                </div>
                {showSetup ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {showSetup && (
                <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p className="text-sm" style={{ color: 'var(--clr-text-secondary)', lineHeight: 1.6 }}>
                    {t('simulator.connectDesc', { port: gatewayPort })}
                  </p>
                  <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--clr-info-soft)', color: 'var(--clr-info-text)', lineHeight: 1.6 }}>
                    <strong>{t('simulator.railwaySetup')}:</strong><br />
                    {t('simulator.railwaySteps', { port: gatewayPort })}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {t('simulator.internalPort')}: <code className="mono px-1.5 py-0.5 rounded" style={{ background: 'var(--clr-surface-sunken)' }}>{gatewayPort}</code>
                  </p>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
                    <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <li dangerouslySetInnerHTML={{ __html: t('simulator.step1') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('simulator.step2') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('simulator.step3') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('simulator.step4') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('simulator.step5') }} />
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
