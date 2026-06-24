/**
 * SystemLogsPage — zeigt ALLE Backend-Logs (Pulpo, DHL, Print, Gateway, …)
 * live aus dem In-Memory-Ringpuffer des Servers. Fürs gemeinsame Debugging:
 * Auto-Refresh, Level-Filter, Volltextsuche, „Alles kopieren".
 *
 * Route: /logs
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Copy, Pause, Play, Search, Check } from 'lucide-react';
import { api } from '../services/api';

type LogEntry = {
  id: number; timestamp: string; level: string;
  logger: string; module: string; message: string; exception?: string;
};

// INFO/DEBUG werden serverseitig nicht mehr gepuffert (nur WARNING/ERROR) —
// daher hier kein INFO-Filter mehr, der ohnehin leer bliebe.
const LEVELS = ['ALLE', 'WARNING', 'ERROR'] as const;
const LEVEL_COLOR: Record<string, string> = {
  DEBUG: '#64748b', INFO: '#0f172a', WARNING: '#b45309', ERROR: '#dc2626', CRITICAL: '#dc2626',
};
const LEVEL_BG: Record<string, string> = {
  DEBUG: '#f1f5f9', INFO: '#eff6ff', WARNING: '#fffbeb', ERROR: '#fef2f2', CRITICAL: '#fee2e2',
};

// Backend liefert UTC-ISO (…+00:00). Hier in DEUTSCHE Lokalzeit (Europe/Berlin)
// umrechnen und HH:MM:SS.mmm anzeigen — vorher wurde die UTC-Zeit per
// String-Slice roh übernommen (2 h Versatz im Sommer).
function fmtLogTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(11, 23);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('ALLE');
  const [q, setQ] = useState('');
  const [live, setLive] = useState(true);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getLogs({
        limit: 1500,
        level: level === 'ALLE' ? undefined : level,
        q: q.trim() || undefined,
      });
      setLogs(res.logs);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [level, q]);

  // Erst-Load + Auto-Refresh (nur wenn „live").
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [live, load]);

  // Auto-Scroll ans Ende, solange der Nutzer unten ist.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const asText = () =>
    logs.map((e) => `${e.timestamp} [${e.level}] ${e.logger}: ${e.message}` +
      (e.exception ? `\n    EXC: ${e.exception}` : '')).join('\n');

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Backend-Logs</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--clr-text-muted)' }}>
            Live-Ringpuffer · {logs.length} Einträge {live ? '· Auto-Refresh an' : '· pausiert'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Level-Filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {LEVELS.map((l) => (
              <button key={l} type="button" onClick={() => setLevel(l)}
                style={{
                  padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${level === l ? '#2563eb' : 'var(--clr-border)'}`,
                  background: level === l ? '#2563eb' : '#fff',
                  color: level === l ? '#fff' : 'var(--clr-text)',
                }}>{l}</button>
            ))}
          </div>
          {/* Suche */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--clr-text-muted)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen (z.B. CMC Label, PRINT, DHL, Pulpo)…"
              style={{ padding: '6px 8px 6px 26px', borderRadius: 7, border: '1px solid var(--clr-border)', fontSize: 12, width: 260 }} />
          </div>
          <button type="button" onClick={() => setLive((v) => !v)} title={live ? 'Pausieren' : 'Live'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid var(--clr-border)', background: '#fff', fontSize: 12, fontWeight: 600 }}>
            {live ? <Pause size={13} /> : <Play size={13} />} {live ? 'Pause' : 'Live'}
          </button>
          <button type="button" onClick={load} title="Jetzt neu laden"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid var(--clr-border)', background: '#fff', fontSize: 12, fontWeight: 600 }}>
            <RefreshCw size={13} />
          </button>
          <button type="button" onClick={copyAll}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600 }}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Kopiert!' : 'Alles kopieren'}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12 }}>
          Fehler beim Laden: {err}
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll}
        style={{
          flex: 1, overflowY: 'auto', background: '#0b1020', borderRadius: 10, padding: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, lineHeight: 1.5,
        }}>
        {logs.length === 0 ? (
          <div style={{ color: '#94a3b8', padding: 12 }}>Noch keine Logs (oder Filter zu eng).</div>
        ) : logs.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 8, padding: '1px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ color: '#64748b', flexShrink: 0 }}>{fmtLogTime(e.timestamp)}</span>
            <span style={{
              flexShrink: 0, fontWeight: 700, minWidth: 64, textAlign: 'center', borderRadius: 3,
              color: LEVEL_COLOR[e.level] ?? '#e2e8f0', background: LEVEL_BG[e.level] ?? '#1e293b',
            }}>{e.level}</span>
            <span style={{ color: '#7dd3fc', flexShrink: 0 }}>{e.logger}</span>
            <span style={{ color: '#e2e8f0' }}>
              {e.message}{e.exception ? `\n    EXC: ${e.exception}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
