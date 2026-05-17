import { ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopStatusBar, { type MachineState } from '../components/liveflow/TopStatusBar';
import PackageStations, {
  type StationId, type StationStatus,
} from '../components/simulator/PackageStations';
import {
  type PackageState, STATE_COLORS,
  applyEventToStations, deriveState, emptyStations,
} from '../lib/packageLifecycle';

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

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const isBad = (v: unknown): boolean =>
  v === 0 || v === '0' || v === false || v === 'false';

// Derive a human-readable reason for the package's current state from the
// raw event stream. Maps to the triggers documented in cmc-process-doc
// Section 7 (error handling) + Section 4 (state lifecycle).
function derivePackageReason(events: RawEvent[], state: PackageState): {
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
} {
  // Walk events newest → oldest, the most recent terminal event wins.
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const d = ev.data ?? {};
    if (ev.type === 'ENQ' && typeof d.rejection_reason === 'string') {
      if (d.rejection_reason === 'no_read') {
        return { text: 'NOREAD — Scanner konnte den Barcode nicht lesen', tone: 'warning' };
      }
      if (d.rejection_reason === 'already_active') {
        return {
          text: 'Doppel-Scan — Paket ist bereits auf dem Förderband (Order-Reservation greift)',
          tone: 'warning',
        };
      }
    }
    if (ev.type === 'REM') {
      return { text: 'Manuell vom Förderband entfernt (REM)', tone: 'warning' };
    }
    if (ev.type === 'END') {
      const status = d.status;
      if (status === 1 || status === '1') {
        return { text: 'Etikett verifiziert — Paket erfolgreich ausgegeben', tone: 'success' };
      }
      return {
        text: 'Etiketten-Verifikation fehlgeschlagen — Paket ausgeworfen (END status≠1)',
        tone: 'error',
      };
    }
    if (ev.type === 'ACK' && (isBad(d.good) || isBad(d.result))) {
      const flag = typeof d.flag === 'string' && d.flag ? ` (${d.flag})` : '';
      return {
        text: `Vom 3D-Sensor abgewiesen — Maße außerhalb Toleranz${flag}`,
        tone: 'error',
      };
    }
    if ((ev.type === 'LAB1' || ev.type === 'LAB2') && isBad(d.good)) {
      return {
        text: `Etiketten-Druck fehlgeschlagen am ${ev.type}`,
        tone: 'error',
      };
    }
  }

  // No terminal event yet — describe the in-flight state.
  switch (state) {
    case 'ASSIGNED':  return { text: 'Barcode gescannt, wartet auf Einschleusung', tone: 'info' };
    case 'INDUCTED':  return { text: 'Paket auf Förderband, wartet auf 3D-Vermessung', tone: 'info' };
    case 'SCANNED':   return { text: 'Vermessen, OK — wartet auf Verpackung & Etikett', tone: 'info' };
    case 'LABELED':   return { text: 'Etikett gedruckt, wartet auf Ausgangs-Scanner', tone: 'info' };
    case 'COMPLETED': return { text: 'Paket abgeschlossen', tone: 'success' };
    case 'FAILED':    return { text: 'Fehler nach Etikettierung — manuelle Auflösung nötig', tone: 'error' };
    case 'EJECTED':   return { text: 'Paket ausgeworfen', tone: 'error' };
    case 'DELETED':   return { text: 'Paket entfernt / Auftrag gelöscht', tone: 'warning' };
  }
}

const TONE_COLORS: Record<'info' | 'success' | 'warning' | 'error', { bg: string; fg: string; border: string }> = {
  info:    { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
  success: { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' },
  warning: { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
  error:   { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
};

interface PackageRow {
  ref: string;
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
  events: RawEvent[];
}

export default function LiveFlowPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectedMachines, setConnectedMachines] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sinceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/events/recent?since=${sinceRef.current}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setConnected(true);
        if (Array.isArray(data.connected_machines)) setConnectedMachines(data.connected_machines);
        if (Array.isArray(data.events) && data.events.length > 0) {
          setEvents((prev) => [...prev, ...data.events].slice(-1000));
        }
        if (typeof data.latest_id === 'number') sinceRef.current = data.latest_id;
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Aggregate events into one row per reference_id. Most recent first.
  const packages = useMemo<PackageRow[]>(() => {
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

      const r = applyEventToStations(ev, pkg.stations);
      if (r.removed) pkg.removed = true;
    }
    for (const pkg of map.values()) {
      pkg.state = deriveState(pkg.stations, pkg.removed);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );
  }, [events]);

  const hasSimulator = connectedMachines.length > 0;
  const machineState: MachineState = hasSimulator ? 'running' : connected ? 'idle' : 'offline';
  const latestType = events[events.length - 1]?.type ?? null;
  const latestBarcode = packages[0]?.barcode ?? null;

  const toggle = (ref: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  return (
    <div>
      <TopStatusBar
        machineState={machineState}
        connectionActive={connected}
        activeBarcode={latestBarcode}
        currentStep={latestType}
        statusMessage={
          hasSimulator
            ? t('liveFlow.streamActive')
            : connected
              ? t('liveFlow.noSimulator')
              : t('liveFlow.backendDisconnected')
        }
      />

      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Pakete (Live)</h1>
            <p className="page-header__desc">
              Eine Zeile pro Paket. Zeile aufklappen, um alle Maschinen-Nachrichten zu sehen.
            </p>
          </div>
          <div className="text-xs tabular-nums" style={{ color: 'var(--clr-text-muted)' }}>
            {packages.length} {packages.length === 1 ? 'Paket' : 'Pakete'}
            {connectedMachines.length > 0 && (
              <> · Maschine <code className="cell-mono">{connectedMachines.join(', ')}</code></>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel__body" style={{ padding: 0 }}>
            {packages.length === 0 ? (
              <EmptyState connected={connected} hasSimulator={hasSimulator} />
            ) : (
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Zeit</th>
                    <th>Referenz</th>
                    <th>Barcode</th>
                    <th>Status</th>
                    <th style={{ minWidth: 360 }}>Stationen</th>
                    <th>Maße (L×B×H mm)</th>
                    <th>Gewicht</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => {
                    const open = expanded.has(pkg.ref);
                    const c = STATE_COLORS[pkg.state];
                    return (
                      <PackageRowView
                        key={pkg.ref}
                        pkg={pkg}
                        open={open}
                        onToggle={() => toggle(pkg.ref)}
                        stateColor={c}
                        stateLabel={t(`status.${pkg.state}`)}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PackageRowProps {
  pkg: PackageRow;
  open: boolean;
  onToggle: () => void;
  stateColor: { bg: string; fg: string; border: string };
  stateLabel: string;
}

function PackageRowView({ pkg, open, onToggle, stateColor, stateLabel }: PackageRowProps) {
  const dims = pkg.length_mm || pkg.width_mm || pkg.height_mm
    ? `${pkg.length_mm ?? '?'}×${pkg.width_mm ?? '?'}×${pkg.height_mm ?? '?'}`
    : '—';
  const weight = pkg.weight_g != null ? `${pkg.weight_g} g` : '—';

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="tabular-nums" style={{ color: 'var(--clr-text-muted)' }}>
          {formatTime(pkg.lastSeen)}
        </td>
        <td><code className="cell-mono">{pkg.ref}</code></td>
        <td><code className="cell-mono">{pkg.barcode ?? '—'}</code></td>
        <td>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 4,
              background: stateColor.bg,
              color: stateColor.fg,
              border: `1px solid ${stateColor.border}`,
              letterSpacing: 0.3,
            }}
          >
            {stateLabel}
          </span>
        </td>
        <td style={{ padding: '8px 12px' }}>
          <PackageStations stations={pkg.stations} removed={pkg.removed} />
        </td>
        <td className="tabular-nums">{dims}</td>
        <td className="tabular-nums">{weight}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--clr-bg-subtle, #fafafa)', padding: 0 }}>
            <ReasonBanner events={pkg.events} state={pkg.state} />
            <RawMessageList events={pkg.events} />
          </td>
        </tr>
      )}
    </>
  );
}

function ReasonBanner({ events, state }: { events: RawEvent[]; state: PackageState }) {
  const { text, tone } = derivePackageReason(events, state);
  const c = TONE_COLORS[tone];
  return (
    <div
      style={{
        margin: '12px 12px 0 40px',
        padding: '8px 12px',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {text}
    </div>
  );
}

function RawMessageList({ events }: { events: RawEvent[] }) {
  // Hide the *_RESPONSE echoes by default — they're our own outbound replies,
  // not messages *from* the machine, and clutter the package detail view.
  const incoming = events.filter((e) => !e.type.endsWith('_RESPONSE'));
  return (
    <div style={{ padding: '8px 12px 12px 40px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {incoming.map((ev) => (
        <div
          key={ev.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 60px 1fr',
            gap: 12,
            padding: '4px 0',
            borderBottom: '1px dashed var(--clr-border)',
            color: 'var(--clr-text)',
          }}
        >
          <span className="tabular-nums" style={{ color: 'var(--clr-text-muted)' }}>
            {formatTime(ev.timestamp)}
          </span>
          <span style={{ fontWeight: 600 }}>{ev.type}</span>
          <span style={{ wordBreak: 'break-all', color: 'var(--clr-text-muted)' }}>
            {ev.raw ?? JSON.stringify(ev.data ?? {})}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ connected, hasSimulator }: { connected: boolean; hasSimulator: boolean }) {
  const msg = !connected
    ? 'Keine Verbindung zum Backend. Läuft uvicorn auf :8000?'
    : !hasSimulator
      ? 'Backend verbunden — aber noch keine Maschine. Simulator unter „Simulator" anschließen (TCP :15001).'
      : 'Maschine verbunden — warte auf das erste ENQ.';
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--clr-text-muted)' }}>
      <Inbox size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
      <p style={{ fontSize: 13 }}>{msg}</p>
    </div>
  );
}
