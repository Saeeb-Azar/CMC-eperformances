import { ScanBarcode, Printer, Wifi, AlertTriangle, Eye, Code } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopStatusBar, { type MachineState } from '../components/liveflow/TopStatusBar';
import LiveActivityCard, { type ActivityState } from '../components/liveflow/LiveActivityCard';
import PackageFlowTracker, { type FlowStep } from '../components/liveflow/PackageFlowTracker';
import LiveEventFeed, { type LiveEvent } from '../components/liveflow/LiveEventFeed';
import ErrorPanel, { type ErrorItem } from '../components/liveflow/ErrorPanel';
import MachineHealthPanel from '../components/liveflow/MachineHealthPanel';
import { api, type DashboardOverview } from '../services/api';

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

const FLOW_ORDER = ['ENQ', 'IND', 'ACK', 'LAB1', 'END'] as const;

const SEVERITY: Record<string, LiveEvent['severity']> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

const TYPE_TO_ACTIVITY: Record<string, ActivityState> = {
  ENQ: 'scanning',
  IND: 'entering',
  ACK: 'measuring',
  INV: 'labeling',
  LAB1: 'labeling',
  LAB2: 'labeling',
  END: 'completed',
  REM: 'rejected',
};

const getRef = (ev: RawEvent): string | null => {
  const d = ev.data as Record<string, unknown> | undefined;
  const ref = d?.reference_id ?? d?.referenceId;
  return typeof ref === 'string' && ref.length > 0 ? ref : null;
};

const getBarcode = (ev: RawEvent): string | undefined => {
  const d = ev.data as Record<string, unknown> | undefined;
  const b = d?.barcode;
  return typeof b === 'string' && b.length > 0 ? b : undefined;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

export default function LiveFlowPage() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'operator' | 'technical'>('operator');
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectedMachines, setConnectedMachines] = useState<string[]>([]);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
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
          setEvents((prev) => [...prev, ...data.events].slice(-500));
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

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.dashboard()
        .then((d) => { if (!cancelled) setOverview(d); })
        .catch(() => { /* ignore */ });
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Derive per-reference lifecycle
  const latestRef = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const r = getRef(events[i]);
      if (r) return r;
    }
    return null;
  }, [events]);

  const eventsForLatest = useMemo(
    () => (latestRef ? events.filter((e) => getRef(e) === latestRef) : []),
    [events, latestRef]
  );

  const steps = useMemo<FlowStep[]>(() => {
    const stages = new Set(eventsForLatest.map((e) => e.type));
    const latestType = eventsForLatest[eventsForLatest.length - 1]?.type;
    const labels: Record<(typeof FLOW_ORDER)[number], string> = {
      ENQ: t('liveFlow.scanned'),
      IND: t('liveFlow.entered'),
      ACK: t('liveFlow.measured'),
      LAB1: t('liveFlow.labeled'),
      END: t('liveFlow.completedStation'),
    };
    return FLOW_ORDER.map((code) => {
      const done = stages.has(code);
      const active = latestType === code;
      const ts = eventsForLatest.find((e) => e.type === code)?.timestamp;
      return {
        id: code.toLowerCase(),
        label: labels[code],
        technicalCode: code,
        icon: <ScanBarcode size={15} />,
        status: done ? (active ? 'active' : 'completed') : 'pending',
        timestamp: ts ? formatTime(ts) : undefined,
      } as FlowStep;
    });
  }, [eventsForLatest, t]);

  const latestType = eventsForLatest[eventsForLatest.length - 1]?.type;
  const activityState: ActivityState = latestType
    ? TYPE_TO_ACTIVITY[latestType] ?? 'idle'
    : 'idle';

  const latestBarcode = useMemo(() => {
    for (let i = eventsForLatest.length - 1; i >= 0; i--) {
      const b = getBarcode(eventsForLatest[i]);
      if (b) return b;
    }
    return undefined;
  }, [eventsForLatest]);

  const firstTime = eventsForLatest[0]?.timestamp;
  const lastTime = eventsForLatest[eventsForLatest.length - 1]?.timestamp;
  const elapsedSeconds =
    firstTime && lastTime
      ? Math.max(0, Math.round((new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000))
      : 0;

  const liveEvents: LiveEvent[] = useMemo(
    () =>
      events
        .slice()
        .reverse()
        .filter((e) => e.type !== 'SYSTEM')
        .slice(0, 40)
        .map((e) => ({
          id: String(e.id),
          message: t(`liveFlow.eventDict.${e.type}.short`, { defaultValue: e.message }),
          technicalCode: e.type,
          severity: SEVERITY[e.severity] ?? 'info',
          timestamp: formatTime(e.timestamp),
          barcode: getBarcode(e),
          referenceId: getRef(e) ?? undefined,
        })),
    [events, t]
  );

  const errors: ErrorItem[] = useMemo(
    () =>
      events
        .slice()
        .reverse()
        .filter((e) => e.severity === 'error' || e.severity === 'warning' || e.type === 'REM')
        .slice(0, 10)
        .map((e) => ({
          id: String(e.id),
          title: e.message,
          description: e.raw ?? '',
          barcode: getBarcode(e),
          referenceId: getRef(e) ?? undefined,
          timestamp: formatTime(e.timestamp),
          severity: e.severity === 'error' || e.type === 'REM' ? 'error' : 'warning',
        })),
    [events]
  );

  const hasSimulator = connectedMachines.length > 0;
  const machineState: MachineState = hasSimulator
    ? activityState === 'rejected' || activityState === 'error'
      ? 'error'
      : 'running'
    : connected
      ? 'idle'
      : 'offline';

  type HealthStatus = 'healthy' | 'warning' | 'error' | 'offline';
  const healthIndicators: { label: string; status: HealthStatus; icon: React.ReactNode }[] = [
    { label: t('liveFlow.healthConnection'), status: connected ? 'healthy' : 'error', icon: <Wifi size={16} /> },
    { label: t('liveFlow.healthScanner'), status: hasSimulator ? 'healthy' : 'offline', icon: <ScanBarcode size={16} /> },
    { label: t('liveFlow.healthPrinter'), status: hasSimulator ? 'healthy' : 'offline', icon: <Printer size={16} /> },
    { label: t('liveFlow.healthErrors'), status: (overview?.failed_today ?? 0) > 0 ? 'warning' : 'healthy', icon: <AlertTriangle size={16} /> },
  ];

  const primaryMachine = connectedMachines[0] ?? 'CW-—';

  return (
    <div>
      <TopStatusBar
        machineState={machineState}
        connectionActive={connected}
        activeBarcode={latestBarcode ?? null}
        currentStep={latestType ?? null}
        statusMessage={hasSimulator ? t('liveFlow.streamActive') : connected ? t('liveFlow.noSimulator') : t('liveFlow.backendDisconnected')}
      />

      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('liveFlow.pageTitle')}</h1>
            <p className="page-header__desc">{t('liveFlow.pageDesc')}</p>
          </div>
          <div className="segmented">
            <button
              onClick={() => setViewMode('operator')}
              className={`segmented__item ${viewMode === 'operator' ? 'segmented__item--active' : ''}`}
            >
              <Eye size={14} /> {t('liveFlow.operator')}
            </button>
            <button
              onClick={() => setViewMode('technical')}
              className={`segmented__item ${viewMode === 'technical' ? 'segmented__item--active' : ''}`}
            >
              <Code size={14} /> {t('liveFlow.technical')}
            </button>
          </div>
        </div>

        {/* Hero: current status */}
        <LiveActivityCard
          state={activityState}
          barcode={latestBarcode}
          elapsedSeconds={elapsedSeconds}
        />

        {/* Flow tracker */}
        <PackageFlowTracker steps={steps} showTechnical={viewMode === 'technical'} />

        {/* Activity feed */}
        <LiveEventFeed events={liveEvents} />

        {/* Machine Health + Issues */}
        <div className="grid-2 gap-5">
          <MachineHealthPanel
            machineName={primaryMachine}
            indicators={healthIndicators}
            packagesTotal={overview?.total_orders_today ?? 0}
            packagesSuccess={overview?.completed_today ?? 0}
            packagesRejected={overview?.ejected_today ?? 0}
            uptimePercent={overview && overview.machines_total > 0
              ? Math.round((overview.machines_online / overview.machines_total) * 1000) / 10
              : 0}
          />
          <ErrorPanel errors={errors} />
        </div>
      </div>
    </div>
  );
}
