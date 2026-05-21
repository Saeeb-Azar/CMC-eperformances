import { ChevronRight, ChevronLeft, Inbox, CheckCircle2, RefreshCw, Trash2, Filter, X, Bell, Scan, Package as PackageIcon, Box, Tag, ArrowRightCircle, Activity, Search, Server } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopStatusBar, { type MachineState } from '../components/liveflow/TopStatusBar';
import {
  type PackageState,
  STATE_COLORS,
  applyEventToStations, deriveState, emptyStations,
} from '../lib/packageLifecycle';
import type { StationId, StationStatus } from '../components/simulator/PackageStations';

interface RawEvent {
  id: number;
  type: string;
  severity: string;
  message: string;
  machine_id?: string;
  data?: Record<string, unknown>;
  raw?: string;
  timestamp: string;
}

const _env = (window as unknown as Record<string, unknown>).__ENV__ as
  | Record<string, string>
  | undefined;
let API_BASE = (_env?.VITE_API_URL || import.meta.env.VITE_API_URL || '')
  .split(',')[0]
  .trim();
if (API_BASE && !API_BASE.startsWith('http')) API_BASE = `https://${API_BASE}`;

// ────────────────────────────────────────────────────────────────────────
// Data helpers
// ────────────────────────────────────────────────────────────────────────

const getRef = (ev: RawEvent): string | null => {
  const d = ev.data as Record<string, unknown> | undefined;
  const ref = d?.reference_id ?? d?.referenceId;
  return typeof ref === 'string' && ref.length > 0 ? ref : null;
};
const getStr = (ev: RawEvent, key: string): string | undefined => {
  const v = ev.data?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};
const getNum = (ev: RawEvent, key: string): number | undefined => {
  const v = ev.data?.[key];
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const isBad = (v: unknown): boolean => v === 0 || v === '0' || v === false || v === 'false';

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const fmtSeit = (iso: string, now: number) => {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// Multi vs Single per cmc-process-doc Section 3: alphabetic / M-prefix
// barcodes route to the multi-order (CartBox) path, pure-numeric ones to
// the single-order path.
type PackageType = 'S' | 'M';
const detectType = (barcode: string | undefined): PackageType =>
  barcode && /[A-Za-z]/.test(barcode) ? 'M' : 'S';

// We carry two identifiers per event:
//   - connection-key like `machine_100.64.0.5_36762` (which TCP socket)
//   - protocol-id like `0001` (what the machine declares about itself)
// Prefer the protocol-id for user-facing labels — that's what's printed
// on the physical CartonWrap unit. Fall back to the connection key
// shortened to `<ip>:<port>` when the protocol id is unknown.
function displayMachineId(raw: string): string {
  // Protocol IDs are short numeric/alphanumeric tokens. Render as CW####
  // if pure digits — matches how the process doc + mockups refer to
  // physical CartonWrap units (CW0001, CW0002, ...).
  if (/^\d+$/.test(raw)) return `CW${raw.padStart(4, '0')}`;
  const m = /^machine_(.+)_(\d+)$/.exec(raw);
  return m ? `${m[1]}:${m[2]}` : raw;
}

// ────────────────────────────────────────────────────────────────────────
// State buckets shown in the top counters and as the row's Status badge
// ────────────────────────────────────────────────────────────────────────

type Bucket = 'IN_PROGRESS' | 'WAITING' | 'PROBLEM' | 'DONE';

const BUCKET_OF: Record<PackageState, Bucket> = {
  ASSIGNED:  'WAITING',
  INDUCTED:  'IN_PROGRESS',
  SCANNED:   'IN_PROGRESS',
  LABELED:   'IN_PROGRESS',
  COMPLETED: 'DONE',
  FAILED:    'PROBLEM',
  EJECTED:   'PROBLEM',
  DELETED:   'PROBLEM',
};

// Per cmc-process-doc Section 4 — the 8 lifecycle states each get their
// own label and color in the table, so the operator sees exactly *which*
// state the package is in, not just the broad bucket.
const STATE_LABEL: Record<PackageState, string> = {
  ASSIGNED:  'Zugewiesen',
  INDUCTED:  'Eingeschleust',
  SCANNED:   'Vermessen',
  LABELED:   'Etikettiert',
  COMPLETED: 'Abgeschlossen',
  FAILED:    'Fehlgeschlagen',
  EJECTED:   'Ausgeworfen',
  DELETED:   'Gelöscht',
};

const BUCKET_LABEL: Record<Bucket, string> = {
  IN_PROGRESS: 'In Bearbeitung',
  WAITING:     'Wartend',
  PROBLEM:     'Problem',
  DONE:        'Fertig',
};
const BUCKET_COLORS: Record<Bucket, { bg: string; fg: string; border: string; dot: string }> = {
  IN_PROGRESS: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0', dot: '#10b981' },
  WAITING:     { bg: '#fffbeb', fg: '#92400e', border: '#fde68a', dot: '#f59e0b' },
  PROBLEM:     { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca', dot: '#ef4444' },
  DONE:        { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
};

// ────────────────────────────────────────────────────────────────────────
// "Aktuelle Station" — derived from state + last event
// ────────────────────────────────────────────────────────────────────────

type StationKey = 'scanner' | 'enq' | 'sensor' | 'wrapper' | 'labeler' | 'exit';
const STATION_LABELS: Record<StationKey, string> = {
  scanner:  'Scanner',
  enq:      'ENQ Check',
  sensor:   '3D Messung',
  wrapper:  'Verpacker',
  labeler:  'Etikettierer',
  exit:     'Ausgang',
};
const STATION_ICONS: Record<StationKey, React.ComponentType<{ size?: number }>> = {
  scanner: Scan,
  enq: CheckCircle2,
  sensor: Box,
  wrapper: PackageIcon,
  labeler: Tag,
  exit: ArrowRightCircle,
};

function currentStation(state: PackageState): StationKey {
  switch (state) {
    case 'ASSIGNED':  return 'enq';
    case 'INDUCTED':  return 'sensor';
    case 'SCANNED':   return 'wrapper';
    case 'LABELED':   return 'labeler';
    case 'COMPLETED': return 'exit';
    case 'EJECTED':
    case 'FAILED':    return 'exit';
    case 'DELETED':   return 'enq';
  }
}

// ────────────────────────────────────────────────────────────────────────
// Package row aggregation
// ────────────────────────────────────────────────────────────────────────

interface PackageRow {
  ref: string;
  machine_id?: string;
  barcode?: string;
  state: PackageState;
  stations: Record<StationId, StationStatus>;
  removed: boolean;
  firstSeen: string;
  lastSeen: string;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  weight_g?: number;
  manualState?: PackageState;
  manualReason?: string;
  manualBy?: string;
  events: RawEvent[];
}

function aggregatePackages(events: RawEvent[]): PackageRow[] {
  const map = new Map<string, PackageRow>();
  for (const ev of events) {
    const ref = getRef(ev);
    if (!ref) continue;
    let pkg = map.get(ref);
    if (!pkg) {
      pkg = {
        ref,
        state: 'ASSIGNED',
        stations: emptyStations(),
        removed: false,
        firstSeen: ev.timestamp,
        lastSeen: ev.timestamp,
        events: [],
      };
      map.set(ref, pkg);
    }
    pkg.lastSeen = ev.timestamp;
    pkg.events.push(ev);
    pkg.barcode ??= getStr(ev, 'barcode');
    // Prefer the protocol id ("0001") the machine declares about itself
    // over the gateway's per-socket connection key.
    pkg.machine_id ??= getStr(ev, 'machine_id') ?? ev.machine_id;

    if (ev.type === 'ACK') {
      pkg.length_mm ??= getNum(ev, 'length_mm');
      pkg.width_mm  ??= getNum(ev, 'width_mm');
      pkg.height_mm ??= getNum(ev, 'height_mm');
    }
    if (ev.type === 'LAB1' || ev.type === 'LAB2') {
      pkg.weight_g ??= getNum(ev, 'weight_scale');
    }
    if (ev.type === 'END') {
      pkg.length_mm = getNum(ev, 'sizes_length') ?? pkg.length_mm;
      pkg.width_mm  = getNum(ev, 'sizes_width')  ?? pkg.width_mm;
      pkg.height_mm = getNum(ev, 'sizes_height') ?? pkg.height_mm;
      pkg.weight_g  = getNum(ev, 'weight')       ?? pkg.weight_g;
    }

    if (ev.type === 'RESOLVE') {
      pkg.manualState = 'COMPLETED';
      pkg.manualReason = getStr(ev, 'reason');
      pkg.manualBy = getStr(ev, 'resolved_by');
    } else if (ev.type === 'DELETE') {
      pkg.manualState = 'DELETED';
      pkg.manualReason = getStr(ev, 'reason');
      pkg.manualBy = getStr(ev, 'resolved_by');
    }

    const r = applyEventToStations(ev, pkg.stations);
    if (r.removed) pkg.removed = true;
  }
  for (const pkg of map.values()) {
    pkg.state = pkg.manualState ?? deriveState(pkg.stations, pkg.removed);
  }
  // Oldest first → Position 1 is the package that's been on the belt longest.
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime(),
  );
}

// Translate ENQ/IND/... to operator-readable verbs for the Verlauf timeline.
function eventLabel(ev: RawEvent): string {
  const d = ev.data ?? {};
  switch (ev.type) {
    case 'ENQ':
      if (d.rejection_reason === 'no_read') return 'NOREAD — Barcode nicht lesbar';
      if (d.rejection_reason === 'already_active') return 'Doppel-Scan abgewiesen';
      return 'Barcode gelesen';
    case 'IND':  return 'Eingeschleust';
    case 'ACK':  return isBad(d.good) ? 'Vermessung abgewiesen' : '3D Vermessung OK';
    case 'INV':  return 'Rechnung gedruckt';
    case 'LAB1': return isBad(d.good) ? 'Etikettendruck fehlgeschlagen' : 'Label angefordert';
    case 'LAB2': return 'Zweites Label angefordert';
    case 'END':  return (d.status === 1 || d.status === '1') ? 'Erfolgreich ausgegeben' : 'Ausgangs-Verifikation fehlgeschlagen';
    case 'REM':  return 'Manuell entfernt';
    case 'HBT':  return 'Heartbeat';
    case 'RESOLVE': return `Manuell gelöst (${getStr(ev, 'resolved_by') ?? 'admin'})`;
    case 'DELETE':  return `Gelöscht (${getStr(ev, 'resolved_by') ?? 'admin'})`;
    case 'RETRY':   return `Wiederholung gestartet (${getStr(ev, 'resolved_by') ?? 'admin'})`;
    case 'SYSTEM':  return ev.message;
    default: return ev.type;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Main page component
// ────────────────────────────────────────────────────────────────────────

export default function LiveFlowPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectedMachines, setConnectedMachines] = useState<string[]>([]);
  const [pendingConnections, setPendingConnections] = useState(0);
  const [machineModes, setMachineModes] = useState<Record<string, string>>({});
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sinceRef = useRef(0);

  // Event polling
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/events/recent?since=${sinceRef.current}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setConnected(true);
        if (Array.isArray(data.connected_machines)) setConnectedMachines(data.connected_machines);
        if (typeof data.pending_connections === 'number') setPendingConnections(data.pending_connections);
        if (data.machine_modes && typeof data.machine_modes === 'object') setMachineModes(data.machine_modes);
        if (Array.isArray(data.events) && data.events.length > 0) {
          setEvents((prev) => [...prev, ...data.events].slice(-2000));
        }
        if (typeof data.latest_id === 'number') sinceRef.current = data.latest_id;
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Tick "Seit" counters every second so they stay live even without new events.
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // All packages (across machines), used to compute per-machine stats.
  const allPackages = useMemo(() => aggregatePackages(events), [events]);

  // Build a synthetic machine list: any machine we've seen events from,
  // plus those reported as connected by the gateway.
  const machineList = useMemo(() => {
    const ids = new Set<string>();
    for (const m of connectedMachines) ids.add(m);
    for (const p of allPackages) if (p.machine_id) ids.add(p.machine_id);
    return Array.from(ids).sort();
  }, [allPackages, connectedMachines]);

  // Auto-select first machine once we have one.
  useEffect(() => {
    if (!selectedMachine && machineList.length > 0) setSelectedMachine(machineList[0]);
  }, [machineList, selectedMachine]);

  // Packages for the focused machine, filtered by search.
  const packages = useMemo(() => {
    const list = selectedMachine
      ? allPackages.filter((p) => p.machine_id === selectedMachine)
      : allPackages;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      p.ref.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q),
    );
  }, [allPackages, selectedMachine, search]);

  // Bucket counts for the cards
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { IN_PROGRESS: 0, WAITING: 0, PROBLEM: 0, DONE: 0 };
    for (const p of packages) c[BUCKET_OF[p.state]]++;
    return c;
  }, [packages]);

  // Machine list stats (for the left sidebar)
  const machineStats = useMemo(() => {
    const stats = new Map<string, { total: number; singles: number; multi: number }>();
    for (const p of allPackages) {
      if (!p.machine_id) continue;
      const s = stats.get(p.machine_id) ?? { total: 0, singles: 0, multi: 0 };
      s.total++;
      if (detectType(p.barcode) === 'M') s.multi++;
      else s.singles++;
      stats.set(p.machine_id, s);
    }
    return stats;
  }, [allPackages]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.ref === selectedRef) ?? null,
    [packages, selectedRef],
  );

  const hasSimulator = connectedMachines.length > 0;
  const machineState: MachineState = hasSimulator ? 'running' : connected ? 'idle' : 'offline';
  const latestType = events[events.length - 1]?.type ?? null;
  const latestBarcode = allPackages.length > 0 ? (allPackages[allPackages.length - 1].barcode ?? null) : null;

  const setMachineMode = async (machineId: string, mode: 'multi_only' | null) => {
    // Optimistic local update so the toggle feels instant.
    setMachineModes((prev) => {
      const next = { ...prev };
      if (mode) next[machineId] = mode;
      else delete next[machineId];
      return next;
    });
    try {
      await fetch(`${API_BASE}/api/v1/machines/${encodeURIComponent(machineId)}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    } catch (e) {
      console.error('setMachineMode failed', e);
    }
  };

  const runAction = async (action: 'resolve' | 'retry' | 'delete', pkg: PackageRow) => {
    const prompts = {
      resolve: 'Auflösungs-Grund:',
      retry:   'Grund für Wiederholung:',
      delete:  'Lösch-Grund:',
    };
    const reason = window.prompt(prompts[action]);
    if (!reason || !reason.trim()) return;
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/api/v1/packages/${encodeURIComponent(pkg.ref)}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ machine_id: pkg.machine_id ?? '', reason: reason.trim() }),
      });
      if (!res.ok) window.alert(`Aktion fehlgeschlagen: ${res.status} ${await res.text()}`);
    } catch (e) {
      window.alert(`Aktion fehlgeschlagen: ${String(e)}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopStatusBar
        machineState={machineState}
        connectionActive={connected}
        activeBarcode={latestBarcode}
        currentStep={latestType}
        statusMessage={
          hasSimulator
            ? t('liveFlow.streamActive')
            : !connected
              ? t('liveFlow.backendDisconnected')
              : pendingConnections > 0
                ? t('liveFlow.simulatorIdentifying')
                : t('liveFlow.noSimulator')
        }
      />
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `${sidebarOpen ? '220px' : '44px'} 1fr ${selectedPackage ? '340px' : '0'}`,
        minHeight: 0,
      }}>
        <MachineSidebar
          machines={machineList}
          stats={machineStats}
          selected={selectedMachine}
          onSelect={setSelectedMachine}
          connectedIds={connectedMachines}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />
        <MainPane
          machine={selectedMachine}
          packages={packages}
          counts={counts}
          search={search}
          onSearch={setSearch}
          selectedRef={selectedRef}
          onSelectRef={setSelectedRef}
          connected={connected}
          hasSimulator={hasSimulator}
          nowTs={nowTs}
          multiOnly={selectedMachine ? machineModes[selectedMachine] === 'multi_only' : false}
          onMultiOnlyChange={(v) => {
            if (selectedMachine) setMachineMode(selectedMachine, v ? 'multi_only' : null);
          }}
        />
        <FocusPanel
          pkg={selectedPackage}
          onClose={() => setSelectedRef(null)}
          onAction={runAction}
          nowTs={nowTs}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Left: CW machine list
// ────────────────────────────────────────────────────────────────────────

interface MachineSidebarProps {
  machines: string[];
  stats: Map<string, { total: number; singles: number; multi: number }>;
  selected: string | null;
  onSelect: (m: string) => void;
  connectedIds: string[];
  open: boolean;
  onToggle: () => void;
}

function MachineSidebar({ machines, stats, selected, onSelect, connectedIds, open, onToggle }: MachineSidebarProps) {
  return (
    <aside style={{
      borderRight: '1px solid var(--clr-border)',
      background: 'var(--clr-bg-elevated, #fff)',
      overflowY: 'auto',
      padding: open ? '10px 10px' : '10px 6px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <button
        onClick={onToggle}
        title={open ? 'Sidebar einklappen' : 'Sidebar ausklappen'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: open ? 'space-between' : 'center',
          padding: '6px 8px', marginBottom: 4,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--clr-text)',
        }}
      >
        {open && <strong style={{ fontSize: 13 }}>Maschinen</strong>}
        {open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {machines.length === 0 ? (
        open ? (
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', padding: '12px 8px', textAlign: 'center' }}>
            Noch keine Maschine
          </div>
        ) : null
      ) : (
        machines.map((m) => {
          const isActive = m === selected;
          const isOnline = connectedIds.includes(m);
          const s = stats.get(m) ?? { total: 0, singles: 0, multi: 0 };
          const dotColor = isOnline ? '#10b981' : '#94a3b8';

          if (!open) {
            return (
              <button
                key={m}
                onClick={() => onSelect(m)}
                title={`${displayMachineId(m)} · ${s.total} Pakete`}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, margin: '0 auto',
                  background: isActive ? 'var(--clr-bg-subtle, #f4f6fa)' : 'transparent',
                  border: `1px solid ${isActive ? '#3b82f6' : 'var(--clr-border)'}`,
                  borderRadius: 6, cursor: 'pointer',
                }}
              >
                <Server size={14} />
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  width: 8, height: 8, borderRadius: 99,
                  background: dotColor, border: '2px solid var(--clr-bg-elevated, #fff)',
                }} />
              </button>
            );
          }

          return (
            <button
              key={m}
              onClick={() => onSelect(m)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px',
                background: isActive ? 'var(--clr-bg-subtle, #f4f6fa)' : 'transparent',
                border: `1px solid ${isActive ? '#3b82f6' : 'var(--clr-border)'}`,
                borderRadius: 6, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: dotColor, flexShrink: 0 }} />
                <code style={{
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  minWidth: 0, flex: 1,
                }}>
                  {displayMachineId(m)}
                </code>
              </div>
              <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>
                {s.total} · S {s.singles} · M {s.multi}
              </div>
            </button>
          );
        })
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed var(--clr-border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 8px 6px', color: 'var(--clr-text-muted)',
          }}>
            <Box size={12} />
            <strong style={{ fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase' }}>
              CW-Liste
            </strong>
          </div>
          <div style={{
            fontSize: 11, color: 'var(--clr-text-muted)',
            padding: '10px', textAlign: 'center',
            border: '1px dashed var(--clr-border)', borderRadius: 6,
            background: 'var(--clr-bg-subtle, #f8fafc)',
          }}>
            Bald verfügbar
          </div>
        </div>
      )}
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Center: counters + packages table
// ────────────────────────────────────────────────────────────────────────

interface MainPaneProps {
  machine: string | null;
  packages: PackageRow[];
  counts: Record<Bucket, number>;
  search: string;
  onSearch: (s: string) => void;
  selectedRef: string | null;
  onSelectRef: (r: string | null) => void;
  connected: boolean;
  hasSimulator: boolean;
  nowTs: number;
  multiOnly: boolean;
  onMultiOnlyChange: (v: boolean) => void;
}

function MainPane(p: MainPaneProps) {
  const totalSingles = p.packages.filter((x) => detectType(x.barcode) === 'S').length;
  const totalMulti   = p.packages.filter((x) => detectType(x.barcode) === 'M').length;

  return (
    <section style={{ overflowY: 'auto', padding: '20px 28px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>
              {p.machine ? displayMachineId(p.machine) : 'Keine Maschine ausgewählt'}
            </h1>
            {p.machine && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#ecfdf5', color: '#047857', fontWeight: 600, letterSpacing: 0.3 }}>
                AKTIV
              </span>
            )}
            <button
              onClick={() => p.onMultiOnlyChange(!p.multiOnly)}
              aria-pressed={p.multiOnly}
              disabled={!p.machine}
              title={
                !p.machine ? 'Maschine wählen, um den Modus zu setzen'
                : p.multiOnly ? 'Multi-Only Modus aktiv — numerische Barcodes werden am Scanner abgelehnt. Klicken zum Ausschalten.'
                : 'Maschine in Multi-Only-Modus schalten (akzeptiert nur Multi-Order-Barcodes)'
              }
              style={{
                padding: '2px 10px', fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                border: `1px solid ${p.multiOnly ? '#3b82f6' : 'var(--clr-border)'}`,
                borderRadius: 4,
                background: p.multiOnly ? '#eff6ff' : 'transparent',
                color: p.multiOnly ? '#1d4ed8' : 'var(--clr-text-muted)',
                cursor: p.machine ? 'pointer' : 'not-allowed',
                opacity: p.machine ? 1 : 0.5,
              }}
            >
              Multi
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginTop: 4 }}>
            {p.packages.length} {p.packages.length === 1 ? 'Bestellung' : 'Bestellungen'}
            {' · '}Singles: {totalSingles}{' · '}Multi: {totalMulti}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            position: 'relative',
            display: 'flex', alignItems: 'center',
          }}>
            <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--clr-text-muted)' }} />
            <input
              type="text"
              placeholder="Suchen (Ref oder Barcode)"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              style={{
                padding: '6px 8px 6px 26px', fontSize: 12,
                border: '1px solid var(--clr-border)', borderRadius: 6,
                background: 'var(--clr-bg-elevated, #fff)',
                width: 220,
              }}
            />
          </div>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', fontSize: 12,
            border: '1px solid var(--clr-border)', borderRadius: 6,
            background: 'var(--clr-bg-elevated, #fff)',
            cursor: 'pointer',
          }}>
            <Filter size={13} /> Filter
          </button>
          <Bell size={15} style={{ color: 'var(--clr-text-muted)' }} />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {(['IN_PROGRESS', 'WAITING', 'PROBLEM', 'DONE'] as Bucket[]).map((b) => {
          const c = BUCKET_COLORS[b];
          return (
            <div key={b} style={{
              padding: '14px 16px',
              background: 'var(--clr-bg-elevated, #fff)',
              border: `1px solid var(--clr-border)`,
              borderLeft: `3px solid ${c.dot}`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{p.counts[b]}</div>
              <div style={{ fontSize: 11, color: c.fg, fontWeight: 600, marginTop: 4 }}>
                {BUCKET_LABEL[b]}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: 'var(--clr-bg-elevated, #fff)', border: '1px solid var(--clr-border)', borderRadius: 8, overflow: 'hidden' }}>
        {p.packages.length === 0 ? (
          <EmptyState connected={p.connected} hasSimulator={p.hasSimulator} />
        ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--clr-bg-subtle, #fafafa)', borderBottom: '1px solid var(--clr-border)' }}>
                <Th>Position</Th>
                <Th>Typ</Th>
                <Th>Barcode / ID</Th>
                <Th>Referenz</Th>
                <Th>Status</Th>
                <Th>Aktuelle Station</Th>
                <Th>Seit</Th>
                <Th>Maße (L×B×H mm)</Th>
                <Th>Gewicht</Th>
              </tr>
            </thead>
            <tbody>
              {p.packages.map((pkg, idx) => (
                <TableRow
                  key={pkg.ref}
                  pkg={pkg}
                  position={idx + 1}
                  selected={pkg.ref === p.selectedRef}
                  onClick={() => p.onSelectRef(pkg.ref === p.selectedRef ? null : pkg.ref)}
                  nowTs={p.nowTs}
                />
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: 'left', padding: '10px 12px',
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: 0.5, color: 'var(--clr-text-muted)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}

interface TableRowProps {
  pkg: PackageRow;
  position: number;
  selected: boolean;
  onClick: () => void;
  nowTs: number;
}

function TableRow({ pkg, position, selected, onClick, nowTs }: TableRowProps) {
  const sc = STATE_COLORS[pkg.state];
  const station = currentStation(pkg.state);
  const StationIcon = STATION_ICONS[station];
  const type = detectType(pkg.barcode);
  const dims = (pkg.length_mm || pkg.width_mm || pkg.height_mm)
    ? `${pkg.length_mm ?? '?'}×${pkg.width_mm ?? '?'}×${pkg.height_mm ?? '?'}`
    : '—';
  const weight = pkg.weight_g != null ? `${pkg.weight_g} g` : '—';

  return (
    <tr
      onClick={onClick}
      style={{
        background: selected ? 'var(--clr-bg-subtle, #f4f6fa)' : 'transparent',
        borderBottom: '1px solid var(--clr-border)',
        cursor: 'pointer',
      }}
    >
      <Td><span className="tabular-nums" style={{ color: 'var(--clr-text-muted)' }}>{position}</span></Td>
      <Td>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 4,
          fontSize: 11, fontWeight: 700,
          background: type === 'M' ? '#ede9fe' : '#dbeafe',
          color:      type === 'M' ? '#5b21b6' : '#1e40af',
        }}>{type}</span>
      </Td>
      <Td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{pkg.barcode ?? '—'}</code></Td>
      <Td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{pkg.ref}</code></Td>
      <Td>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: 4,
          fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
          background: sc.bg, color: sc.fg, border: `1px solid ${sc.border}`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: sc.fg }} />
          {STATE_LABEL[pkg.state]}
        </span>
      </Td>
      <Td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--clr-text)' }}>
          <StationIcon size={14} />
          {STATION_LABELS[station]}
        </span>
      </Td>
      <Td><span className="tabular-nums" style={{ color: 'var(--clr-text-muted)' }}>{fmtSeit(pkg.lastSeen, nowTs)}</span></Td>
      <Td><span className="tabular-nums">{dims}</span></Td>
      <Td><span className="tabular-nums">{weight}</span></Td>
    </tr>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
      {children}
    </td>
  );
}

function EmptyState({ connected, hasSimulator }: { connected: boolean; hasSimulator: boolean }) {
  const msg = !connected
    ? 'Keine Verbindung zum Backend. Läuft uvicorn auf :8000?'
    : !hasSimulator
      ? 'Backend verbunden — aber noch keine Maschine. Simulator unter „Simulator" anschließen.'
      : 'Maschine verbunden — warte auf das erste ENQ.';
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--clr-text-muted)' }}>
      <Inbox size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
      <p style={{ fontSize: 13 }}>{msg}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Right: focus panel (Bestellung im Fokus)
// ────────────────────────────────────────────────────────────────────────

interface FocusPanelProps {
  pkg: PackageRow | null;
  onClose: () => void;
  onAction: (a: 'resolve' | 'retry' | 'delete', pkg: PackageRow) => void;
  nowTs: number;
}

function FocusPanel({ pkg, onClose, onAction, nowTs }: FocusPanelProps) {
  if (!pkg) {
    // Grid column is 0px wide in this state — render nothing instead of an
    // overflowing empty aside.
    return null;
  }

  const type = detectType(pkg.barcode);
  const sc = STATE_COLORS[pkg.state];
  const station = currentStation(pkg.state);
  const StationIcon = STATION_ICONS[station];
  const dims = (pkg.length_mm || pkg.width_mm || pkg.height_mm)
    ? `${pkg.length_mm ?? '?'}×${pkg.width_mm ?? '?'}×${pkg.height_mm ?? '?'}`
    : '—';
  const weight = pkg.weight_g != null ? `${pkg.weight_g} g` : '—';
  const canResolve = pkg.state === 'EJECTED' || pkg.state === 'FAILED';
  const canRetry   = pkg.state === 'FAILED';
  const canDelete  = pkg.state !== 'DELETED';

  return (
    <aside style={{
      borderLeft: '1px solid var(--clr-border)',
      background: 'var(--clr-bg-elevated, #fff)',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>Bestellung im Fokus</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--clr-text-muted)' }}>
          <X size={15} />
        </button>
      </header>

      <div style={{ padding: 20, borderBottom: '1px solid var(--clr-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 6,
            fontSize: 15, fontWeight: 700,
            background: type === 'M' ? '#ede9fe' : '#dbeafe',
            color:      type === 'M' ? '#5b21b6' : '#1e40af',
          }}>{type}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{pkg.ref}</div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
              {type === 'M' ? 'Multiorder' : 'Singleorder'}
            </div>
          </div>
        </div>

        <dl style={{ marginTop: 16, fontSize: 12, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 12 }}>
          <dt style={{ color: 'var(--clr-text-muted)' }}>Maschine</dt>
          <dd><code style={{ fontFamily: 'var(--font-mono)' }}>{pkg.machine_id ? displayMachineId(pkg.machine_id) : '—'}</code></dd>
          <dt style={{ color: 'var(--clr-text-muted)' }}>Barcode / ID</dt>
          <dd><code style={{ fontFamily: 'var(--font-mono)' }}>{pkg.barcode ?? '—'}</code></dd>
          <dt style={{ color: 'var(--clr-text-muted)' }}>Maße (L×B×H)</dt>
          <dd className="tabular-nums">{dims}</dd>
          <dt style={{ color: 'var(--clr-text-muted)' }}>Gewicht</dt>
          <dd className="tabular-nums">{weight}</dd>
        </dl>
      </div>

      <div style={{ padding: 20, borderBottom: '1px solid var(--clr-border)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--clr-text-muted)', marginBottom: 8 }}>
          Aktuelle Station
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 6,
            background: sc.bg,
            color: sc.fg,
          }}>
            <StationIcon size={16} />
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{STATION_LABELS[station]}</div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
              State <strong style={{ color: sc.fg }}>{STATE_LABEL[pkg.state]}</strong> · seit {fmtSeit(pkg.lastSeen, nowTs)}
            </div>
          </div>
        </div>

        <StationProgress stations={pkg.stations} current={station} removed={pkg.removed} />
      </div>

      <div style={{ padding: 20, borderBottom: '1px solid var(--clr-border)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--clr-text-muted)', marginBottom: 8 }}>
          Verlauf (Messages)
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {pkg.events
            .filter((e) => !e.type.endsWith('_RESPONSE') && e.type !== 'HBT')
            .map((ev) => (
              <li key={ev.id} style={{ display: 'grid', gridTemplateColumns: '14px 60px 50px 1fr', gap: 8, padding: '5px 0', alignItems: 'baseline' }}>
                <Activity size={11} style={{ color: 'var(--clr-text-muted)' }} />
                <span className="tabular-nums" style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>{fmtTime(ev.timestamp)}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#eff6ff', color: '#1e40af', display: 'inline-block', textAlign: 'center' }}>{ev.type}</span>
                <span style={{ fontSize: 11, color: 'var(--clr-text)' }}>{eventLabel(ev)}</span>
              </li>
            ))}
        </ul>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {canResolve && (
          <ActionBigBtn tone="success" icon={<CheckCircle2 size={14} />} onClick={() => onAction('resolve', pkg)}>
            Als gelöst markieren
          </ActionBigBtn>
        )}
        {canRetry && (
          <ActionBigBtn tone="info" icon={<RefreshCw size={14} />} onClick={() => onAction('retry', pkg)}>
            Wiederholen
          </ActionBigBtn>
        )}
        {canDelete && (
          <ActionBigBtn tone="danger" icon={<Trash2 size={14} />} onClick={() => onAction('delete', pkg)}>
            Soft-Delete
          </ActionBigBtn>
        )}
      </div>
    </aside>
  );
}

// Horizontal station progress visualisation used inside the Focus Panel.
function StationProgress({ stations, current, removed }: {
  stations: Record<StationId, StationStatus>;
  current: StationKey;
  removed: boolean;
}) {
  // Map our StationId set (scanner/induction/sensor/wrapper/labeler/exit) to
  // the focus-panel labels.
  const sequence: { key: StationKey; lib: StationId }[] = [
    { key: 'scanner', lib: 'scanner' },
    { key: 'enq',     lib: 'scanner' },
    { key: 'sensor',  lib: 'sensor' },
    { key: 'wrapper', lib: 'wrapper' },
    { key: 'labeler', lib: 'labeler' },
    { key: 'exit',    lib: 'exit' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 16 }}>
      {sequence.map((s, i) => {
        const status = stations[s.lib];
        const isCurrent = s.key === current && !removed;
        const Icon = STATION_ICONS[s.key];
        let bg = '#f1f5f9', fg = '#94a3b8';
        if (isCurrent) { bg = '#fef3c7'; fg = '#92400e'; }
        else if (status === 'passed') { bg = '#ecfdf5'; fg = '#047857'; }
        else if (status === 'failed') { bg = '#fef2f2'; fg = '#991b1b'; }
        return (
          <div key={s.key + i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 99, background: bg, color: fg,
            }}>
              <Icon size={12} />
            </span>
            <span style={{ fontSize: 9, color: 'var(--clr-text-muted)', marginTop: 4, textAlign: 'center' }}>
              {STATION_LABELS[s.key].split(' ')[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ActionBigBtn({
  children, onClick, icon, tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  tone: 'success' | 'info' | 'danger';
}) {
  const colors = {
    success: { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' },
    info:    { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
    danger:  { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  } as const;
  const c = colors[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: c.bg, color: c.fg,
        border: `1px solid ${c.border}`, borderRadius: 6,
        fontSize: 12, fontWeight: 500,
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      {icon}
      {children}
      <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: 0.5 }} />
    </button>
  );
}
