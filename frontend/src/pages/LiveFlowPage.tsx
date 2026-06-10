import { ChevronRight, ChevronLeft, Inbox, CheckCircle2, RefreshCw, Trash2, Filter, X, Bell, Scan, Package as PackageIcon, Box, Tag, ArrowRightCircle, Activity, Search, Server, Clock, AlertCircle } from 'lucide-react';
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
const BUCKET_ICON: Record<Bucket, typeof Box> = {
  IN_PROGRESS: Box,
  WAITING:     Clock,
  PROBLEM:     AlertCircle,
  DONE:        CheckCircle2,
};

// Tiny inline SVG sparkline for the stat cards.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 120, h = 32;
  if (values.length < 2) {
    return <svg width={w} height={h} style={{ display: 'block' }} />;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block' }} preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.75}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
  rejectionReason?: string;
  rejectionStation?: 'scanner' | 'sensor' | 'labeler' | 'exit';
  cwList?: string;
  events: RawEvent[];
}

// Sentinel for the table filter meaning "across all CW-Listen".
const ALL_CW_LISTS = '__ALL__';

interface CWListItem {
  barcode: string;
  expected: number;
  consumed: number;
}

interface CWList {
  name: string;
  active: boolean;
  source?: string;  // "pulpo" = auto-synced from the Pulpo queue (read-only)
  items: CWListItem[];
  total_expected: number;
  total_consumed: number;
  remaining: number;
}

const REJECTION_LABEL: Record<string, string> = {
  no_read:         'Barcode nicht lesbar',
  already_active:  'Doppel-Scan',
  unknown_barcode: 'Nicht in CW-Liste',
  multi_only_mode: 'Multi-Modus: Single abgewiesen',
  skipped_by_subsequent_end: 'Übersprungen (späteres END)',
  dimensions_rejected: '3D-Maße abgewiesen',
  label_verification_failed: 'Etikett-Verifikation fehlgeschlagen',
  manual_eject:    'Manuell ausgeworfen',
  weight_deviation: 'Gewicht außerhalb Toleranz',
  size_deviation:  'Maße außerhalb Toleranz',
};

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

    // CW-Liste, durch die der Scan akzeptiert wurde, kommt im ENQ-Payload
    // vom Gateway mit. Wir nehmen die erste, die wir sehen — danach bleibt
    // sie konstant für das Paket.
    pkg.cwList ??= getStr(ev, 'cw_list');

    // Pick up rejection reasons emitted by the gateway, so the row can
    // show *why* the order ended up in EJECTED (not just that it did).
    const reason = getStr(ev, 'rejection_reason') ?? getStr(ev, 'ejection_reason');
    if (reason) {
      pkg.rejectionReason = reason;
      pkg.rejectionStation =
        ev.type === 'ENQ'  ? 'scanner' :
        ev.type === 'ACK'  ? 'sensor' :
        ev.type === 'LAB1' || ev.type === 'LAB2' ? 'labeler' :
        ev.type === 'END' || ev.type === 'EJECT' ? 'exit' :
        pkg.rejectionStation;
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
      if (d.rejection_reason === 'no_read')         return 'NOREAD — Barcode nicht lesbar';
      if (d.rejection_reason === 'already_active')  return 'Doppel-Scan abgewiesen';
      if (d.rejection_reason === 'unknown_barcode') return 'Abgewiesen — nicht in CW-Liste';
      if (d.rejection_reason === 'multi_only_mode') return 'Abgewiesen — Multi-Modus, Single-Barcode';
      return 'Barcode gelesen';
    case 'IND':  return 'Eingeschleust';
    case 'ACK':  return isBad(d.good) ? 'Vermessung abgewiesen' : '3D Vermessung OK';
    case 'INV':  return 'Rechnung gedruckt';
    case 'LAB1': return isBad(d.good) ? 'Etikettendruck fehlgeschlagen' : 'Label angefordert';
    case 'LAB2': return 'Zweites Label angefordert';
    case 'END':  return (d.status === 1 || d.status === '1') ? 'Erfolgreich ausgegeben' : 'Ausgangs-Verifikation fehlgeschlagen';
    case 'REM':  return 'Manuell entfernt';
    case 'EJECT': return `Auto-Auswurf (übersprungen durch END ${getNum(ev, 'trigger_sequence') ?? '?'})`;
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
  const [pulpoTestMode, setPulpoTestMode] = useState<boolean | null>(null);
  const [countsHistory, setCountsHistory] = useState<Record<Bucket, number>[]>([]);
  const [cwLists, setCwLists] = useState<Record<string, CWList[]>>({});
  // refs that are scheduled for mid-flight eject — keyed by machine_id.
  // The Eject-Button puts the ref in here, the backend pops it once the
  // next ACK / INV / LAB1 / LAB2 / END for that ref arrives.
  const [pendingEjections, setPendingEjections] = useState<Record<string, string[]>>({});
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Filter auf Tabelle: nur Pakete dieser CW-Liste anzeigen (oder alle).
  const [cwListFilter, setCwListFilter] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Cutoff für „Tabelle geleert" wird in localStorage gespiegelt, damit
  // ein Reload den Clear nicht rückgängig macht — wir starten den Poll
  // direkt ab dem letzten Cutoff statt bei 0.
  const sinceRef = useRef<number>(
    typeof window !== 'undefined'
      ? Number(window.localStorage.getItem('cmc.clearCutoffId') || 0)
      : 0,
  );

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
        if (typeof data.pulpo_test_mode === 'boolean') setPulpoTestMode(data.pulpo_test_mode);
        if (data.cw_lists && typeof data.cw_lists === 'object') setCwLists(data.cw_lists);
        if (data.pending_ejections && typeof data.pending_ejections === 'object') {
          setPendingEjections(data.pending_ejections);
        } else {
          setPendingEjections({});
        }
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

  // Packages for the focused machine, filtered by search and CW-Liste.
  const packages = useMemo(() => {
    let list = selectedMachine
      ? allPackages.filter((p) => p.machine_id === selectedMachine)
      : allPackages;
    if (cwListFilter === ALL_CW_LISTS) list = list.filter((p) => !!p.cwList);
    else if (cwListFilter) list = list.filter((p) => p.cwList === cwListFilter);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      p.ref.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q),
    );
  }, [allPackages, selectedMachine, search, cwListFilter]);

  // Bucket counts for the cards
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { IN_PROGRESS: 0, WAITING: 0, PROBLEM: 0, DONE: 0 };
    for (const p of packages) c[BUCKET_OF[p.state]]++;
    return c;
  }, [packages]);

  // Keep a short rolling history of the bucket counts for the card sparklines.
  useEffect(() => {
    setCountsHistory((prev) => [...prev, counts].slice(-40));
  }, [counts]);

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

  const upsertCwList = async (
    machineId: string,
    name: string,
    patch: { active?: boolean; barcodes?: string[] },
  ) => {
    // Optimistisch lokal anwenden — Backend liefert beim nächsten Poll
    // die kanonische Form zurück (aggregiert nach Menge, plus consumed).
    setCwLists((prev) => {
      const list = prev[machineId] ?? [];
      const idx = list.findIndex((l) => l.name === name);
      const empty: CWList = {
        name, active: false, items: [],
        total_expected: 0, total_consumed: 0, remaining: 0,
      };
      const current: CWList = idx >= 0 ? list[idx] : empty;
      let items = current.items;
      if (patch.barcodes !== undefined) {
        // Eingabe-Liste (Duplikate erlaubt) → aggregierte Items
        const counts = new Map<string, number>();
        for (const raw of patch.barcodes) {
          const b = raw.trim();
          if (!b) continue;
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
        // consumed aus altem Stand übernehmen (auf neue expected gekappt)
        const oldByBarcode = new Map(current.items.map((x) => [x.barcode, x]));
        items = [...counts.entries()].map(([barcode, expected]) => ({
          barcode,
          expected,
          consumed: Math.min(oldByBarcode.get(barcode)?.consumed ?? 0, expected),
        }));
      }
      const total_expected = items.reduce((s, x) => s + x.expected, 0);
      const total_consumed = items.reduce((s, x) => s + x.consumed, 0);
      const merged: CWList = {
        name,
        active: patch.active ?? current.active,
        items,
        total_expected,
        total_consumed,
        remaining: total_expected - total_consumed,
      };
      const next = [...list];
      if (idx >= 0) next[idx] = merged;
      else next.push(merged);
      return { ...prev, [machineId]: next };
    });
    try {
      await fetch(
        `${API_BASE}/api/v1/machines/${encodeURIComponent(machineId)}/cw-lists/${encodeURIComponent(name)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
    } catch (e) {
      console.error('upsertCwList failed', e);
    }
  };

  const ejectPackage = async (machineId: string, ref: string) => {
    // Optimistisch: in der Pending-Liste eintragen, damit der Button-Status
    // sofort umspringt. Sobald die Maschine das nächste ACK/LAB1/END
    // schickt, popt das Backend den Eintrag und der Reject wird verschickt.
    setPendingEjections((prev) => {
      const list = prev[machineId] ?? [];
      if (list.includes(ref)) return prev;
      return { ...prev, [machineId]: [...list, ref] };
    });
    try {
      await fetch(
        `${API_BASE}/api/v1/machines/${encodeURIComponent(machineId)}/eject/${encodeURIComponent(ref)}`,
        { method: 'POST' },
      );
    } catch (e) {
      console.error('ejectPackage failed', e);
    }
  };

  const handleClearTable = () => {
    const count = allPackages.length;
    if (count === 0) return;
    const ok = window.confirm(
      `Tabelle wirklich leeren?\n\n${count} ${count === 1 ? 'Bestellung wird' : 'Bestellungen werden'} aus der Live-Ansicht entfernt. Die Backend-Historie bleibt erhalten — neue Events erscheinen normal.`,
    );
    if (!ok) return;
    setEvents([]);
    setSelectedRef(null);
    setPendingEjections({});
    try {
      window.localStorage.setItem('cmc.clearCutoffId', String(sinceRef.current));
    } catch {
      // localStorage kann blockiert sein — Reload würde dann alte
      // Events wiedersehen, kein Beinbruch.
    }
    // Backend-Tracker leeren, sonst weist er den nächsten gleichen
    // Barcode als Doppel-Scan ab, obwohl die Tabelle leer ist.
    void fetch(`${API_BASE}/api/v1/runtime/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch((e) => console.error('runtime reset failed', e));
  };

  const cancelEject = async (machineId: string, ref: string) => {
    setPendingEjections((prev) => {
      const list = prev[machineId] ?? [];
      return { ...prev, [machineId]: list.filter((x) => x !== ref) };
    });
    try {
      await fetch(
        `${API_BASE}/api/v1/machines/${encodeURIComponent(machineId)}/eject/${encodeURIComponent(ref)}`,
        { method: 'DELETE' },
      );
    } catch (e) {
      console.error('cancelEject failed', e);
    }
  };

  const deleteCwList = async (machineId: string, name: string) => {
    setCwLists((prev) => {
      const list = prev[machineId] ?? [];
      return { ...prev, [machineId]: list.filter((l) => l.name !== name) };
    });
    try {
      await fetch(
        `${API_BASE}/api/v1/machines/${encodeURIComponent(machineId)}/cw-lists/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
    } catch (e) {
      console.error('deleteCwList failed', e);
    }
  };

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
      {pulpoTestMode !== null && (
        <div style={{
          padding: '4px 14px', fontSize: 11, fontWeight: 600, textAlign: 'center',
          background: pulpoTestMode ? '#eff6ff' : '#fff7ed',
          color: pulpoTestMode ? '#1d4ed8' : '#c2410c',
          borderBottom: '1px solid var(--clr-border)',
        }}>
          {pulpoTestMode
            ? 'TEST-MODUS — Pulpo wird nur gelesen, keine Schreibvorgänge'
            : '● LIVE — Schreibvorgänge an Pulpo sind aktiv'}
        </div>
      )}
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
          cwLists={selectedMachine ? (cwLists[selectedMachine] ?? []) : []}
          onUpsertCwList={(name, patch) => {
            if (selectedMachine) upsertCwList(selectedMachine, name, patch);
          }}
          onDeleteCwList={(name) => {
            if (selectedMachine) deleteCwList(selectedMachine, name);
          }}
          cwListFilter={cwListFilter}
          onCwListFilterChange={setCwListFilter}
        />
        <MainPane
          machine={selectedMachine}
          packages={packages}
          counts={counts}
          history={countsHistory}
          cwLists={selectedMachine ? (cwLists[selectedMachine] ?? []) : []}
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
          pendingEjectionRefs={
            new Set(selectedMachine ? (pendingEjections[selectedMachine] ?? []) : [])
          }
          onEject={ejectPackage}
          onCancelEject={cancelEject}
          onClearTable={handleClearTable}
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
  cwLists: CWList[];
  onUpsertCwList: (name: string, patch: { active?: boolean; barcodes?: string[] }) => void;
  onDeleteCwList: (name: string) => void;
  cwListFilter: string | null;
  onCwListFilterChange: (next: string | null) => void;
}

function MachineSidebar({
  machines, stats, selected, onSelect, connectedIds, open, onToggle,
  cwLists, onUpsertCwList, onDeleteCwList, cwListFilter, onCwListFilterChange,
}: MachineSidebarProps) {
  // CW-Listen come exclusively from Pulpo now — no manual creation/editing.
  const [editingList, setEditingList] = useState<string | null>(null);
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 8px 6px', color: 'var(--clr-text-muted)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Box size={12} />
              <strong style={{ fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                CW-Listen
              </strong>
            </span>
            <span style={{ fontSize: 10 }}>{cwLists.length}</span>
          </div>

          {!selected ? (
            <div style={{
              fontSize: 11, color: 'var(--clr-text-muted)',
              padding: '10px', textAlign: 'center',
              border: '1px dashed var(--clr-border)', borderRadius: 6,
              background: 'var(--clr-bg-subtle, #f8fafc)',
            }}>
              Maschine wählen
            </div>
          ) : (
            <>
              {cwLists.length === 0 ? (
                <div style={{
                  fontSize: 10, color: 'var(--clr-text-muted)',
                  padding: '8px', textAlign: 'center',
                  border: '1px dashed var(--clr-border)', borderRadius: 4,
                }}>
                  Keine Pulpo-Queue — Pick-Location der Maschine in den Einstellungen setzen
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 360, overflowY: 'auto' }}>
                  <button
                    onClick={() => onCwListFilterChange(cwListFilter === ALL_CW_LISTS ? null : ALL_CW_LISTS)}
                    title="Tabelle quer durch alle CW-Listen filtern"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 6, padding: '6px 8px', cursor: 'pointer',
                      border: `1px solid ${cwListFilter === ALL_CW_LISTS ? '#3b82f6' : 'var(--clr-border)'}`,
                      borderRadius: 4,
                      background: cwListFilter === ALL_CW_LISTS ? '#3b82f6' : 'transparent',
                      color: cwListFilter === ALL_CW_LISTS ? '#fff' : 'var(--clr-text)',
                      fontSize: 11, fontWeight: 600, textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Filter size={11} /> Alle CW-Listen
                    </span>
                    <Filter size={10} style={{ opacity: cwListFilter === ALL_CW_LISTS ? 1 : 0.4 }} />
                  </button>
                  {cwLists.map((lst) => {
                    const isFiltered = cwListFilter === lst.name;
                    return (
                      <div
                        key={lst.name}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 8px',
                          border: `1px solid ${lst.active ? '#3b82f6' : 'var(--clr-border)'}`,
                          borderRadius: 4,
                          background: lst.active
                            ? '#eff6ff'
                            : isFiltered ? 'var(--clr-bg-subtle, #f4f6fa)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={lst.active}
                          onChange={(e) => onUpsertCwList(lst.name, { active: e.target.checked })}
                          title={lst.active ? 'Liste aktiv — wird bei ENQ geprüft' : 'Inaktiv — wird nicht geprüft'}
                          style={{ cursor: 'pointer' }}
                        />
                        <button
                          onClick={() => setEditingList(lst.name)}
                          style={{
                            flex: 1, minWidth: 0, textAlign: 'left',
                            padding: 0, border: 'none', background: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {lst.name}
                            {lst.source === 'pulpo' && (
                              <span style={{
                                fontSize: 8, fontWeight: 700, letterSpacing: 0.3,
                                padding: '1px 4px', borderRadius: 3,
                                background: '#dbeafe', color: '#1d4ed8',
                              }}>PULPO</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>
                            {lst.total_consumed} / {lst.total_expected} verbraucht
                            {lst.items.length > 0 && lst.items.length !== lst.total_expected
                              ? ` · ${lst.items.length} ${lst.items.length === 1 ? 'Artikel' : 'Artikel'}`
                              : ''}
                          </div>
                        </button>
                        <button
                          onClick={() => onCwListFilterChange(isFiltered ? null : lst.name)}
                          title={isFiltered ? 'Filter aus' : 'Tabelle nach dieser Liste filtern'}
                          style={{
                            padding: '2px 6px', fontSize: 9, fontWeight: 600,
                            border: `1px solid ${isFiltered ? '#3b82f6' : 'var(--clr-border)'}`,
                            background: isFiltered ? '#3b82f6' : 'transparent',
                            color: isFiltered ? '#fff' : 'var(--clr-text-muted)',
                            borderRadius: 3, cursor: 'pointer',
                          }}
                        >
                          <Filter size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {cwListFilter && (
                <button
                  onClick={() => onCwListFilterChange(null)}
                  style={{
                    width: '100%', marginTop: 6, padding: '4px 8px', fontSize: 10,
                    border: '1px dashed var(--clr-border)', borderRadius: 4,
                    background: 'transparent', cursor: 'pointer',
                    color: 'var(--clr-text-muted)',
                  }}
                >
                  Filter „{cwListFilter === ALL_CW_LISTS ? 'Alle CW-Listen' : cwListFilter}" deaktivieren
                </button>
              )}
            </>
          )}
        </div>
      )}

      {editingList && (() => {
        const lst = cwLists.find((l) => l.name === editingList);
        if (!lst) return null;
        return (
          <CWListModal
            list={lst}
            onClose={() => setEditingList(null)}
            onSave={(barcodes) => onUpsertCwList(editingList, { barcodes })}
            onDelete={() => { onDeleteCwList(editingList); setEditingList(null); }}
          />
        );
      })()}
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────────
// CW-Listen Editor-Modal
// ────────────────────────────────────────────────────────────────────────

interface CWListModalProps {
  list: CWList;
  onClose: () => void;
  onSave: (barcodes: string[]) => void;
  onDelete: () => void;
}

function CWListModal({ list, onClose, onSave, onDelete }: CWListModalProps) {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<CWListItem[]>(list.items);
  // Live-Updates aus dem Polling-Stream übernehmen — vor allem damit
  // der consumed-Zähler im offenen Modal mitwächst, wenn die Maschine
  // scannt während der Operator das Modal noch offen hat.
  useEffect(() => { setItems(list.items); }, [list.items]);

  const totalExpected = items.reduce((s, x) => s + x.expected, 0);
  const totalConsumed = items.reduce((s, x) => s + x.consumed, 0);
  // Pulpo-sourced lists are read-only — content is derived from the queue.
  const readOnly = list.source === 'pulpo';

  const persist = (next: CWListItem[]) => {
    setItems(next);
    // Backend nimmt eine flache Liste — Duplikate werden serverseitig
    // wieder zu Mengen aggregiert. Wir blähen einfach jede Menge auf.
    const flat: string[] = [];
    for (const it of next) {
      for (let i = 0; i < it.expected; i += 1) flat.push(it.barcode);
    }
    onSave(flat);
  };

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const idx = items.findIndex((x) => x.barcode === v);
    let next: CWListItem[];
    if (idx >= 0) {
      next = [...items];
      next[idx] = { ...next[idx], expected: next[idx].expected + 1 };
    } else {
      next = [...items, { barcode: v, expected: 1, consumed: 0 }];
    }
    persist(next);
    setDraft('');
  };

  const inc = (barcode: string) => {
    const next = items.map((x) =>
      x.barcode === barcode ? { ...x, expected: x.expected + 1 } : x,
    );
    persist(next);
  };

  const dec = (barcode: string) => {
    const next = items
      .map((x) => x.barcode === barcode
        ? { ...x, expected: x.expected - 1, consumed: Math.min(x.consumed, x.expected - 1) }
        : x,
      )
      .filter((x) => x.expected > 0);
    persist(next);
  };

  const remove = (barcode: string) => {
    persist(items.filter((x) => x.barcode !== barcode));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--clr-bg-elevated, #fff)',
          borderRadius: 8,
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--clr-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{list.name}</div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
              {totalConsumed} / {totalExpected} verbraucht
              {items.length > 0 && (
                <span> · {items.length} {items.length === 1 ? 'Artikel' : 'Artikel'}</span>
              )}
              {list.active && <span style={{ marginLeft: 8, color: '#1d4ed8', fontWeight: 600 }}>· AKTIV</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 4, border: 'none', background: 'transparent', cursor: 'pointer',
            }}
          ><X size={16} /></button>
        </div>

        {readOnly ? (
          <div style={{
            margin: '14px 18px 0', padding: '8px 10px', fontSize: 11,
            borderRadius: 6, background: '#eff6ff', color: '#1d4ed8',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Box size={13} />
            Automatisch aus der Pulpo-Queue synchronisiert — read-only.
          </div>
        ) : (
          <div style={{ padding: '14px 18px', display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder="Barcode + Enter"
              autoFocus
              style={{
                flex: 1, padding: '6px 10px', fontSize: 13,
                fontFamily: 'var(--font-mono)',
                border: '1px solid var(--clr-border)', borderRadius: 6,
              }}
            />
            <button
              onClick={add}
              disabled={!draft.trim()}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600,
                border: '1px solid var(--clr-border)', borderRadius: 6,
                background: 'var(--clr-bg-subtle, #f4f6fa)',
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                opacity: draft.trim() ? 1 : 0.5,
              }}
            >Hinzufügen</button>
          </div>
        )}

        <div style={{
          padding: '0 18px 14px', flex: 1, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {items.length === 0 ? (
            <div style={{
              fontSize: 12, color: 'var(--clr-text-muted)',
              padding: '20px', textAlign: 'center',
              border: '1px dashed var(--clr-border)', borderRadius: 6,
            }}>
              Noch keine Artikel
            </div>
          ) : (
            items.map((it) => {
              const full = it.consumed >= it.expected;
              return (
                <div key={it.barcode} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', fontSize: 12,
                  background: full ? '#f0fdf4' : 'var(--clr-bg-subtle, #f8fafc)',
                  border: full ? '1px solid #bbf7d0' : '1px solid transparent',
                  borderRadius: 4,
                }}>
                  <code style={{
                    flex: 1, minWidth: 0,
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{it.barcode}</code>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600,
                    color: full ? '#166534' : 'var(--clr-text-muted)',
                    whiteSpace: 'nowrap',
                  }}>
                    {it.consumed} / {it.expected}
                  </div>
                  {!readOnly && (
                    <>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button
                          onClick={() => dec(it.barcode)}
                          title="Menge -1"
                          style={{
                            width: 22, height: 22, padding: 0,
                            border: '1px solid var(--clr-border)',
                            background: 'var(--clr-bg-elevated, #fff)',
                            borderRadius: 3, cursor: 'pointer',
                            fontSize: 13, fontWeight: 700, lineHeight: '20px',
                          }}
                        >−</button>
                        <button
                          onClick={() => inc(it.barcode)}
                          title="Menge +1"
                          style={{
                            width: 22, height: 22, padding: 0,
                            border: '1px solid var(--clr-border)',
                            background: 'var(--clr-bg-elevated, #fff)',
                            borderRadius: 3, cursor: 'pointer',
                            fontSize: 13, fontWeight: 700, lineHeight: '20px',
                          }}
                        >+</button>
                      </div>
                      <button
                        onClick={() => remove(it.barcode)}
                        title="Eintrag ganz entfernen"
                        style={{
                          padding: 2, border: 'none', background: 'transparent',
                          color: 'var(--clr-text-muted)', cursor: 'pointer',
                        }}
                      ><X size={13} /></button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--clr-border)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          {readOnly ? (
            <span />
          ) : (
            <button
              onClick={() => {
                if (window.confirm(`Liste „${list.name}" wirklich löschen?`)) onDelete();
              }}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                border: '1px solid #fecaca', background: '#fef2f2',
                color: '#991b1b', borderRadius: 6, cursor: 'pointer',
              }}
            >
              <Trash2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Löschen
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              border: '1px solid var(--clr-border)',
              background: 'var(--clr-bg-elevated, #fff)',
              borderRadius: 6, cursor: 'pointer',
            }}
          >Schließen</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Center: counters + packages table
// ────────────────────────────────────────────────────────────────────────

interface MainPaneProps {
  machine: string | null;
  packages: PackageRow[];
  counts: Record<Bucket, number>;
  history: Record<Bucket, number>[];
  cwLists: CWList[];
  search: string;
  onSearch: (s: string) => void;
  selectedRef: string | null;
  onSelectRef: (r: string | null) => void;
  connected: boolean;
  hasSimulator: boolean;
  nowTs: number;
  multiOnly: boolean;
  onMultiOnlyChange: (v: boolean) => void;
  pendingEjectionRefs: Set<string>;
  onEject: (machineId: string, ref: string) => void;
  onCancelEject: (machineId: string, ref: string) => void;
  onClearTable: () => void;
}

const PAGE_SIZE = 25;

function MainPane(p: MainPaneProps) {
  const totalSingles = p.packages.filter((x) => detectType(x.barcode) === 'S').length;
  const totalMulti   = p.packages.filter((x) => detectType(x.barcode) === 'M').length;
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(p.packages.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = p.packages.slice(pageStart, pageStart + PAGE_SIZE);
  // Reset to first page if the result set shrank below the current page.
  useEffect(() => { if (page > pageCount - 1) setPage(0); }, [pageCount, page]);

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
          <button
            onClick={p.onClearTable}
            disabled={p.packages.length === 0}
            title="Live-Ansicht leeren — Backend-Historie bleibt"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', fontSize: 12, fontWeight: 600,
              border: '1px solid #fecaca',
              background: p.packages.length === 0 ? '#fef2f2' : '#fef2f2',
              color: '#991b1b',
              borderRadius: 6,
              cursor: p.packages.length === 0 ? 'not-allowed' : 'pointer',
              opacity: p.packages.length === 0 ? 0.5 : 1,
            }}
          >
            <Trash2 size={13} /> Leeren
          </button>
          <Bell size={15} style={{ color: 'var(--clr-text-muted)' }} />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {(['IN_PROGRESS', 'WAITING', 'PROBLEM', 'DONE'] as Bucket[]).map((b) => {
          const c = BUCKET_COLORS[b];
          const Icon = BUCKET_ICON[b];
          const series = p.history.map((h) => h[b]);
          const delta = series.length > 1 ? series[series.length - 1] - series[0] : 0;
          return (
            <div key={b} style={{
              padding: '16px 18px 10px',
              background: 'var(--clr-bg-elevated, #fff)',
              border: '1px solid var(--clr-border)',
              borderRadius: 12,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: 10, background: c.bg, color: c.fg,
                }}><Icon size={17} /></span>
                <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: 'var(--clr-text)' }}>{p.counts[b]}</span>
              </div>
              <div style={{ fontSize: 12, color: c.fg, fontWeight: 600, marginTop: 10 }}>{BUCKET_LABEL[b]}</div>
              <div style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', marginTop: 2 }}>
                {delta > 0 ? `+${delta}` : delta} zuletzt
              </div>
              <div style={{ marginTop: 6, marginLeft: -2 }}>
                <Sparkline values={series} color={c.dot} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Aufträge — gefiltert über die CW-Listen-Auswahl in der Sidebar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 2px 12px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>Aufträge</h3>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
          background: '#dbeafe', color: '#1d4ed8',
        }}>{p.packages.length}</span>
      </div>

      <div style={{
        background: 'var(--clr-bg-elevated, #fff)', border: '1px solid var(--clr-border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {p.packages.length === 0 ? (
          <EmptyState connected={p.connected} hasSimulator={p.hasSimulator} />
        ) : (
        <>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--clr-bg-subtle, #fafafa)', borderBottom: '1px solid var(--clr-border)' }}>
                <Th>Position</Th>
                <Th>Ref / Barcode</Th>
                <Th>Status</Th>
                <Th>Aktuelle Station</Th>
                <Th>Seit</Th>
                <Th>Maße (L×B×H mm)</Th>
                <Th>Gewicht</Th>
                <Th>Aktion</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((pkg, idx) => (
                <TableRow
                  key={pkg.ref}
                  pkg={pkg}
                  position={pageStart + idx + 1}
                  selected={pkg.ref === p.selectedRef}
                  onClick={() => p.onSelectRef(pkg.ref === p.selectedRef ? null : pkg.ref)}
                  nowTs={p.nowTs}
                  ejectPending={p.pendingEjectionRefs.has(pkg.ref)}
                  onEject={() => { if (pkg.machine_id) p.onEject(pkg.machine_id, pkg.ref); }}
                  onCancelEject={() => { if (pkg.machine_id) p.onCancelEject(pkg.machine_id, pkg.ref); }}
                />
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid var(--clr-border)',
          fontSize: 12, color: 'var(--clr-text-muted)',
        }}>
          <span>{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, p.packages.length)} von {p.packages.length}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPage((x) => Math.max(0, x - 1))}
              disabled={safePage === 0}
              style={pagerBtn(safePage === 0)}
            ><ChevronLeft size={14} /></button>
            <span className="tabular-nums" style={{ padding: '0 8px' }}>{safePage + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((x) => Math.min(pageCount - 1, x + 1))}
              disabled={safePage >= pageCount - 1}
              style={pagerBtn(safePage >= pageCount - 1)}
            ><ChevronRight size={14} /></button>
          </div>
        </div>
        </>
        )}
      </div>
    </section>
  );
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    border: '1px solid var(--clr-border)', background: 'var(--clr-bg-elevated, #fff)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  };
}


// Header/cell styling now comes from the shared table.css (.data-table).
function Th({ children }: { children: React.ReactNode }) {
  return <th>{children}</th>;
}

interface TableRowProps {
  pkg: PackageRow;
  position: number;
  selected: boolean;
  onClick: () => void;
  nowTs: number;
  ejectPending: boolean;
  onEject: () => void;
  onCancelEject: () => void;
}

function TableRow({
  pkg, position, selected, onClick, nowTs,
  ejectPending, onEject, onCancelEject,
}: TableRowProps) {
  const sc = STATE_COLORS[pkg.state];
  const station = currentStation(pkg.state);
  const StationIcon = STATION_ICONS[station];
  const type = detectType(pkg.barcode);
  const dims = (pkg.length_mm || pkg.width_mm || pkg.height_mm)
    ? `${pkg.length_mm ?? '?'}×${pkg.width_mm ?? '?'}×${pkg.height_mm ?? '?'}`
    : '—';
  const weight = pkg.weight_g != null ? `${pkg.weight_g} g` : '—';
  const isProblem = pkg.state === 'EJECTED' || pkg.state === 'FAILED';
  const rejectLabel = pkg.rejectionReason
    ? REJECTION_LABEL[pkg.rejectionReason] ?? pkg.rejectionReason
    : null;

  return (
    <tr
      onClick={onClick}
      style={{
        background: selected
          ? 'var(--clr-bg-subtle, #f4f6fa)'
          : isProblem ? '#fef2f2' : 'transparent',
        borderBottom: '1px solid var(--clr-border)',
        borderLeft: isProblem ? '3px solid #ef4444' : '3px solid transparent',
        cursor: 'pointer',
      }}
    >
      <Td><span className="tabular-nums" style={{ color: 'var(--clr-text-muted)' }}>{position}</span></Td>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 4, flexShrink: 0,
            fontSize: 11, fontWeight: 700,
            background: type === 'M' ? '#ede9fe' : '#dbeafe',
            color:      type === 'M' ? '#5b21b6' : '#1e40af',
          }}>{type}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{pkg.ref}</code>
              {pkg.cwList && (
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.3, padding: '1px 5px',
                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 3,
                }}>{pkg.cwList}</span>
              )}
            </div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--clr-text-muted)' }}>
              {pkg.barcode ?? '—'}
            </code>
          </div>
        </div>
      </Td>
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
        {rejectLabel && (
          <div style={{ fontSize: 10, color: '#991b1b', marginTop: 3 }}>
            {rejectLabel}
          </div>
        )}
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
      <Td>
        {(() => {
          // Eject ist nur sinnvoll solange das Paket noch auf der Linie
          // ist. Nach END / REM / EJECT / FAIL ist es zu spät.
          const canEject = !['ENDED', 'REMOVED', 'EJECTED', 'FAILED'].includes(pkg.state);
          if (!canEject) {
            return <span style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>—</span>;
          }
          if (ejectPending) {
            return (
              <button
                onClick={(e) => { e.stopPropagation(); onCancelEject(); }}
                title="Eject zurücknehmen (solange die Maschine noch nicht das nächste Gate erreicht hat)"
                style={{
                  padding: '3px 8px', fontSize: 10, fontWeight: 600,
                  border: '1px solid #fbbf24', background: '#fffbeb',
                  color: '#92400e', borderRadius: 4, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >Vorgemerkt</button>
            );
          }
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onEject(); }}
              title="Nächstes Gate antworten: REJECT → Maschine wirft am nächsten Gate aus, Band läuft weiter"
              style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 600,
                border: '1px solid #fecaca', background: '#fef2f2',
                color: '#991b1b', borderRadius: 4, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >Eject</button>
          );
        })()}
      </Td>
    </tr>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={className}>{children}</td>;
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

        {pkg.rejectionReason && (
          <div style={{
            marginTop: 12,
            padding: '8px 10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', letterSpacing: 0.4 }}>
              ABGEWIESEN{pkg.rejectionStation && ` AM ${STATION_LABELS[pkg.rejectionStation].toUpperCase()}`}
            </div>
            <div style={{ fontSize: 12, color: '#7f1d1d' }}>
              {REJECTION_LABEL[pkg.rejectionReason] ?? pkg.rejectionReason}
            </div>
          </div>
        )}
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
