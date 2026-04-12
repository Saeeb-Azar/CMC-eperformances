import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plug, Unplug, Wifi, WifiOff,
  ScanBarcode, LogIn, Ruler, Tag, FileText,
  CheckCircle, XCircle, Trash2, Activity,
  AlertTriangle, Info,
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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

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
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('15001');
  const [machineId, setMachineId] = useState('SIM-001');
  const [connected, setConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [error, setError] = useState('');
  const eventCounter = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/ws/simulator`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      addEvent({ type: 'SYSTEM', severity: 'success', message: 'WebSocket connected to backend' });
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        addEvent(data);
      } catch {
        addEvent({ type: 'SYSTEM', severity: 'warning', message: `Raw: ${e.data}` });
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      addEvent({ type: 'SYSTEM', severity: 'warning', message: 'WebSocket disconnected' });
    };

    ws.onerror = () => {
      setWsConnected(false);
    };
  }, []);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  // Keep WS alive with pings
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

  async function handleConnect() {
    setError('');
    setConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/simulator/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port), machine_id: machineId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Connection failed');
      }
      setConnected(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      setError(msg);
      addEvent({ type: 'SYSTEM', severity: 'error', message: `Connection failed: ${msg}` });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch(`${API_BASE}/api/v1/simulator/disconnect`, { method: 'POST' });
      setConnected(false);
    } catch {
      setError('Disconnect failed');
    }
  }

  const stats = {
    total: events.filter(e => e.type !== 'SYSTEM').length,
    enq: events.filter(e => e.type === 'ENQ').length,
    end: events.filter(e => e.type === 'END').length,
    hbt: events.filter(e => e.type === 'HBT').length,
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
                  {wsConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {wsConnected ? t('common.connected') : t('common.disconnected')}
                  </span>
                  {events.length > 0 && (
                    <button
                      onClick={() => setEvents([])}
                      className="btn btn--ghost"
                      style={{ height: 28, fontSize: 11, padding: '0 8px' }}
                    >
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
                <div ref={eventsEndRef} />
              </div>
            </div>
          </div>

          {/* Right: Connection Panel */}
          <div className="stack-4">
            {/* Connection Status */}
            <div className="hero-panel">
              <div className={`hero-panel__accent ${connected ? 'hero-panel__accent--success' : wsConnected ? 'hero-panel__accent--active' : 'hero-panel__accent--danger'}`} />
              <div className="flex items-center gap-4 px-8 py-5">
                <div className={connected ? 'text-emerald-500' : wsConnected ? 'text-blue-500' : 'text-gray-400'}>
                  {connected ? <Wifi size={22} /> : <WifiOff size={22} />}
                </div>
                <div>
                  <p className="text-lg font-semibold" style={{ color: 'var(--clr-text)' }}>
                    {connected ? t('simulator.simulatorConnected') : wsConnected ? t('simulator.backendConnected') : t('common.disconnected')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
                    {connected ? `${host}:${port} · ${machineId}` : wsConnected ? t('simulator.noSimulator') : t('simulator.noConnection')}
                  </p>
                </div>
              </div>
            </div>

            {/* Connection Form */}
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{t('simulator.connection')}</h3>
              </div>
              <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--clr-text-muted)' }}>{t('simulator.hostIp')}</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="input"
                    placeholder="192.168.178.41"
                    disabled={connected}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--clr-text-muted)' }}>{t('simulator.port')}</label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="input"
                    placeholder="15001"
                    disabled={connected}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--clr-text-muted)' }}>{t('simulator.machineId')}</label>
                  <input
                    type="text"
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    className="input"
                    placeholder="SIM-001"
                    disabled={connected}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs p-3 rounded-lg" style={{ background: 'var(--clr-danger-soft)', color: 'var(--clr-danger-text)' }}>
                    <AlertTriangle size={14} />
                    {error}
                  </div>
                )}

                {!connected ? (
                  <button
                    onClick={handleConnect}
                    disabled={connecting || !host || !port}
                    className="btn btn--primary btn--lg w-full"
                  >
                    <Plug size={16} />
                    {connecting ? t('simulator.connecting') : t('simulator.connectButton')}
                  </button>
                ) : (
                  <button onClick={handleDisconnect} className="btn btn--secondary btn--lg w-full">
                    <Unplug size={16} />
                    {t('simulator.disconnect')}
                  </button>
                )}
              </div>
            </div>

            {/* How to use */}
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{t('simulator.setupGuide')}</h3>
              </div>
              <div className="panel__body" style={{ fontSize: 'var(--text-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
                <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <li>Start <strong>CW1000 CIS Simulator</strong> on your PC</li>
                  <li>Set mode to <strong>"Server"</strong> on port <strong>15001</strong></li>
                  <li>Run the backend locally: <code className="mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--clr-surface-sunken)' }}>uvicorn app.main:app</code></li>
                  <li>Enter the simulator IP address above</li>
                  <li>Click <strong>Connect</strong> and start scanning</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
