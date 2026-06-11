import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import { AlertTriangle, CheckCircle2, Info, ChevronRight, ChevronDown, Search, Database } from 'lucide-react';

interface LogEvent {
  id: number;
  type: string;
  severity: string;
  message: string;
  machine_id?: string;
  data?: Record<string, unknown>;
  raw?: string;
  timestamp: string;
}

const _env = (window as unknown as Record<string, unknown>).__ENV__ as Record<string, string> | undefined;
let API_BASE = (_env?.VITE_API_URL || import.meta.env.VITE_API_URL || '').split(',')[0].trim();
if (API_BASE && !API_BASE.startsWith('http')) API_BASE = `https://${API_BASE}`;

type Bucket = 'problem' | 'success' | 'info';

// Classify an event into Problem / Erfolg / Info.
function bucketOf(ev: LogEvent): Bucket {
  const sev = (ev.severity || '').toLowerCase();
  const t = (ev.type || '').toUpperCase();
  const hasReject = !!(ev.data && (ev.data as Record<string, unknown>).rejection_reason);
  if (sev === 'error' || sev === 'warning' || hasReject || t.includes('EJECT')) return 'problem';
  if (sev === 'success') return 'success';
  return 'info';
}

const BUCKET = {
  problem: { labelKey: 'protokoll.bucket.problem', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', icon: AlertTriangle },
  success: { labelKey: 'protokoll.bucket.success', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0', icon: CheckCircle2 },
  info:    { labelKey: 'protokoll.bucket.info',    color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', icon: Info },
} as const;

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
}

export default function ProtokollPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [persistent, setPersistent] = useState(false);
  const [filter, setFilter] = useState<Bucket | 'all'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const sinceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/events/recent?since=${sinceRef.current}&limit=300`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.events) && data.events.length) {
          // skip the noisy heartbeats in the log
          const fresh = data.events.filter((e: LogEvent) => !['HBT', 'HBT_RESPONSE', 'STS'].includes((e.type || '').toUpperCase()));
          if (fresh.length) setEvents((prev) => [...prev, ...fresh].slice(-2000));
        }
        if (typeof data.latest_id === 'number') sinceRef.current = data.latest_id;
      } catch { /* ignore */ }
    };
    fetch(`${API_BASE}/api/v1/settings/pulpo/status`, { cache: 'no-store' }).catch(() => {});
    poll();
    const id = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Detect whether DB persistence is on (so we can hint at permanent history).
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/audit?limit=1`, { cache: 'no-store' })
      .then((r) => setPersistent(r.ok))
      .catch(() => setPersistent(false));
  }, []);

  const counts = useMemo(() => {
    const c = { problem: 0, success: 0, info: 0 };
    for (const e of events) c[bucketOf(e)]++;
    return c;
  }, [events]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events
      .filter((e) => filter === 'all' || bucketOf(e) === filter)
      .filter((e) => !q || `${e.type} ${e.message} ${e.machine_id ?? ''} ${JSON.stringify(e.data ?? {})}`.toLowerCase().includes(q))
      .slice().reverse();
  }, [events, filter, search]);

  return (
    <div>
      <Topbar title={t('protokoll.title')} subtitle={t('protokoll.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('protokoll.pageTitle')}</h1>
            <p className="page-header__desc">{t('protokoll.pageDesc')}</p>
          </div>
        </div>

        {/* Counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
          {(['problem', 'success', 'info'] as Bucket[]).map((b) => {
            const m = BUCKET[b]; const Icon = m.icon;
            return (
              <button key={b} onClick={() => setFilter(filter === b ? 'all' : b)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', textAlign: 'left',
                  background: '#fff', borderRadius: 14, cursor: 'pointer',
                  border: `1px solid ${filter === b ? m.border : 'var(--clr-border)'}`,
                  outline: filter === b ? `2px solid ${m.border}` : 'none',
                }}>
                <span style={{ width: 42, height: 42, borderRadius: 11, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} /></span>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{counts[b]}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: m.color, marginTop: 3 }}>{t(m.labelKey)}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Persistence hint */}
        {!persistent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14, borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', fontSize: 12 }}>
            <Database size={14} /> <Trans i18nKey="protokoll.persistenceHint" components={{ strong: <strong /> }} />
          </div>
        )}

        {/* Filter bar */}
        <div className="panel">
          <div className="panel__header" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'problem', 'success', 'info'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
                    border: `1px solid ${filter === f ? '#1d4ed8' : 'var(--clr-border)'}`,
                    background: filter === f ? '#1d4ed8' : '#fff', color: filter === f ? '#fff' : 'var(--clr-text-muted)',
                  }}>
                  {f === 'all' ? t('common.all') : t(BUCKET[f].labelKey)}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('protokoll.searchPlaceholder')}
                style={{ width: '100%', height: 30, fontSize: 12, padding: '0 8px 0 26px', border: '1px solid var(--clr-border)', borderRadius: 6 }} />
            </div>
          </div>
          <div className="data-table__scroll" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th style={{ width: 28 }}></th><th style={{ width: 150 }}>{t('audit.time')}</th><th style={{ width: 90 }}>{t('protokoll.colType')}</th><th style={{ width: 110 }}>{t('audit.category')}</th><th>{t('protokoll.colMessage')}</th><th style={{ width: 90 }}>{t('audit.machineCol')}</th></tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--clr-text-muted)' }}>{t('protokoll.noEvents')}</td></tr>
                ) : visible.map((e) => {
                  const b = bucketOf(e); const m = BUCKET[b];
                  const ref = (e.data?.reference_id ?? e.data?.referenceId) as string | undefined;
                  const reject = e.data?.rejection_reason as string | undefined;
                  const open = expanded.has(e.id);
                  const hasDetail = !!(e.raw || (e.data && Object.keys(e.data).length));
                  return (
                    <tr key={e.id} onClick={() => { if (hasDetail) setExpanded((s) => { const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; }); }}
                      style={{ cursor: hasDetail ? 'pointer' : 'default', borderLeft: `3px solid ${b === 'info' ? 'transparent' : m.color}` }}>
                      <td>{hasDetail && <span style={{ color: 'var(--clr-text-muted)' }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}</td>
                      <td className="data-table__num" style={{ color: 'var(--clr-text-muted)' }}>{fmt(e.timestamp)}</td>
                      <td className="data-table__mono">{e.type}</td>
                      <td><span className="pill" style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}><span className="pill__dot" />{t(m.labelKey)}</span></td>
                      <td>
                        {e.message}
                        {ref && <span className="data-table__mono" style={{ color: 'var(--clr-text-muted)', marginLeft: 8, fontSize: 11 }}>{ref}</span>}
                        {reject && <span style={{ color: '#b91c1c', marginLeft: 8, fontSize: 11 }}>({reject})</span>}
                        {open && hasDetail && (
                          <pre style={{ marginTop: 8, padding: 10, background: 'var(--clr-bg-subtle,#f8fafc)', borderRadius: 6, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {e.raw ? `RAW: ${e.raw}\n` : ''}{e.data ? JSON.stringify(e.data, null, 2) : ''}
                          </pre>
                        )}
                      </td>
                      <td className="data-table__mono" style={{ color: 'var(--clr-text-muted)' }}>{e.machine_id ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 8 }}>{t('protokoll.sessionFooter', { count: events.length })}</p>
      </div>
    </div>
  );
}
