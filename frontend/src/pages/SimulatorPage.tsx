import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wifi, WifiOff,
  ScanBarcode, LogIn, Ruler, Tag, FileText,
  CheckCircle, XCircle, Trash2, Activity,
  Info, Server,
} from 'lucide-react';

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
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = API_BASE ? API_BASE.replace(/^https?:/, wsProtocol) : `${wsProtocol}//${window.location.host}`;

// Debug: log the configuration (visible in browser console)
console.log('[Simulator] window.__ENV__:', _env);
console.log('[Simulator] import.meta.env.VITE_API_URL:', import.meta.env.VITE_API_URL);
console.log('[Simulator] API_BASE:', API_BASE);
console.log('[Simulator] WS_BASE:', WS_BASE);

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

export default function SimulatorPage() {
  const { t } = useTranslation();
  const [wsConnected, setWsConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connectedMachines, setConnectedMachines] = useState<string[]>([]);
  const [gatewayPort, setGatewayPort] = useState(15001);
  const eventCounter = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Poll gateway status
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/gateway/status`);
        if (res.ok) {
          const data = await res.json();
          setConnectedMachines(data.connected_machines || []);
          if (data.port) setGatewayPort(data.port);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  // SSE stream (primary) — works through any HTTP proxy
  const connectSSE = useCallback(() => {
    if (sseRef.current) return;
    const url = `${API_BASE}/api/v1/events/stream`;
    console.log('[Simulator] Connecting SSE to:', url);
    const es = new EventSource(url);
    sseRef.current = es;

    es.onopen = () => {
      console.log('[Simulator] SSE OPEN');
      setWsConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        addEvent(data);
        if (data.type === 'SYSTEM' && data.message?.includes('connected')) {
          setConnectedMachines(prev => [...new Set([...prev, data.machine_id].filter(Boolean))]);
        }
      } catch {
        addEvent({ type: 'SYSTEM', severity: 'warning', message: `Raw: ${e.data}` });
      }
    };

    es.onerror = (e) => {
      console.warn('[Simulator] SSE ERROR (EventSource will auto-reconnect):', e);
      setWsConnected(false);
    };
  }, []);

  useEffect(() => {
    connectSSE();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [connectSSE]);

  // Keepalive (legacy WS path)
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  function addEvent(data: Partial<LiveEvent>) {
    eventCounter.current += 1;
    setEvents(prev => [...prev.slice(-200), {
      id: eventCounter.current,
      type: data.type || 'UNKNOWN',
      severity: data.severity || 'info',
      message: data.message || '',
      machine_id: data.machine_id,
      data: data.data,
      raw: data.raw,
      timestamp: data.timestamp || new Date().toISOString(),
    }]);
  }

  const stats = {
    total: events.filter(e => e.type !== 'SYSTEM').length,
    enq: events.filter(e => e.type === 'ENQ').length,
    end: events.filter(e => e.type === 'END').length,
    hbt: events.filter(e => e.type === 'HBT').length,
  };

  const hasSimulator = connectedMachines.length > 0;

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
                  {wsConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {wsConnected ? t('common.connected') : t('common.disconnected')}
                  </span>
                  {events.length > 0 && (
                    <button onClick={() => setEvents([])} className="btn btn--ghost" style={{ height: 28, fontSize: 11, padding: '0 8px' }}>
                      {t('common.clear')}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th style={{ width: 70 }}>Type</th>
                      <th>Event</th>
                      <th style={{ width: 80 }} className="!text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--clr-text-muted)' }}>
                        {t('simulator.waitingForEvents')}
                      </td></tr>
                    ) : (
                      events.slice().reverse().map((ev) => {
                        const sev = severityColors[ev.severity] || severityColors.info;
                        const icon = typeIcons[ev.type] || (ev.severity === 'error' ? <XCircle size={13} /> : <Info size={13} />);
                        const time = new Date(ev.timestamp).toLocaleTimeString('de-DE');
                        return (
                          <tr key={ev.id}>
                            <td>
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${sev.bg} ${sev.text}`}>
                                {icon}
                              </div>
                            </td>
                            <td><span className="cell-mono">{ev.type}</span></td>
                            <td><span className={ev.type !== 'SYSTEM' ? 'cell-primary' : ''}>{ev.message}</span></td>
                            <td className="!text-right"><span className="cell-muted tabular-nums">{time}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Connection Panel */}
          <div className="stack-4">
            {/* Connection Status */}
            <div className="hero-panel">
              <div className={`hero-panel__accent ${hasSimulator ? 'hero-panel__accent--success' : wsConnected ? 'hero-panel__accent--active' : 'hero-panel__accent--danger'}`} />
              <div className="flex items-center gap-4 px-8 py-5">
                <div className={hasSimulator ? 'text-emerald-500' : wsConnected ? 'text-blue-500' : 'text-gray-400'}>
                  {hasSimulator ? <Wifi size={22} /> : <WifiOff size={22} />}
                </div>
                <div>
                  <p className="text-lg font-semibold" style={{ color: 'var(--clr-text)' }}>
                    {hasSimulator ? t('simulator.simulatorConnected') : wsConnected ? t('simulator.backendConnected') : t('common.disconnected')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {hasSimulator ? `${connectedMachines.length} Maschine(n) verbunden` : wsConnected ? t('simulator.noSimulator') : t('simulator.noConnection')}
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

            {/* Simulator Connection Info */}
            <div className="panel">
              <div className="panel__header">
                <div className="flex items-center gap-2">
                  <Server size={16} className="text-blue-500" />
                  <h3 className="panel__title">{t('simulator.connectSimulator')}</h3>
                </div>
              </div>
              <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              </div>
            </div>

            {/* Setup Guide */}
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{t('simulator.setupGuide')}</h3>
              </div>
              <div className="panel__body" style={{ fontSize: 'var(--text-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
                <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <li dangerouslySetInnerHTML={{ __html: t('simulator.step1') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('simulator.step2') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('simulator.step3') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('simulator.step4') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('simulator.step5') }} />
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
