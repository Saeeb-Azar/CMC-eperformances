/**
 * PrintAgent — Browser-Druck-Agent (QZ Tray).
 *
 * Läuft unsichtbar im geöffneten Dashboard-Tab: pollt alle 2s die
 * Backend-Druckqueue und schickt jedes fertige Label über QZ Tray an den
 * konfigurierten LAN-Drucker. Kein Daemon, keine Installation — nutzt das
 * vorhandene QZ Tray.
 *
 * Konfiguration liegt in localStorage (Drucker-IP/Port/Format, Ein/Aus).
 * Ein kleines Status-Badge (unten rechts) zeigt Verbindung + letzten Druck;
 * Klick öffnet die Einstellungen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { qzConnect, qzIsConnected, qzPrintLabel, type PrinterTarget } from '../../services/qzTray';

interface AgentCfg {
  enabled: boolean;
  host: string;
  port: number;
  format: 'pdf' | 'raw';
}

const LS_KEY = 'cmc.printAgent';
const DEFAULT_CFG: AgentCfg = { enabled: false, host: '192.168.1.120', port: 51236, format: 'pdf' };

function loadCfg(): AgentCfg {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_CFG;
}

export default function PrintAgent() {
  const [cfg, setCfg] = useState<AgentCfg>(loadCfg);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastMsg, setLastMsg] = useState<string>('');
  const [lastErr, setLastErr] = useState<string>('');
  const busy = useRef(false);

  const save = (next: AgentCfg) => {
    setCfg(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  };

  // QZ-Verbindung herstellen, sobald aktiviert.
  useEffect(() => {
    if (!cfg.enabled) { setConnected(false); return; }
    let cancelled = false;
    qzConnect()
      .then(() => { if (!cancelled) { setConnected(true); setLastErr(''); } })
      .catch((e) => { if (!cancelled) { setConnected(false); setLastErr(`QZ Tray: ${e?.message || e}`); } });
    return () => { cancelled = true; };
  }, [cfg.enabled]);

  // Poll- & Druck-Schleife.
  const tick = useCallback(async () => {
    if (!cfg.enabled || busy.current) return;
    busy.current = true;
    try {
      if (!qzIsConnected()) {
        await qzConnect();
        setConnected(true);
      }
      const queue = await api.getPrintQueue();
      const target: PrinterTarget = { host: cfg.host, port: cfg.port, format: cfg.format };
      for (const job of queue) {
        if (!job.label_b64) continue;
        try {
          await qzPrintLabel(job.label_b64, target);
          await api.markPrinted(job.id, null);
          setLastMsg(`Gedruckt: ${job.reference_id} (${job.tracking_number}) — ${new Date().toLocaleTimeString()}`);
          setLastErr('');
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await api.markPrinted(job.id, `QZ/Drucker: ${msg}`);
          setLastErr(`Druckfehler ${job.reference_id}: ${msg}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnected(qzIsConnected());
      setLastErr(msg);
    } finally {
      busy.current = false;
    }
  }, [cfg]);

  useEffect(() => {
    if (!cfg.enabled) return;
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [cfg.enabled, tick]);

  // Badge-Farbe je Zustand
  const state: 'off' | 'connecting' | 'ok' | 'error' =
    !cfg.enabled ? 'off' : lastErr ? 'error' : connected ? 'ok' : 'connecting';
  const color = { off: '#94a3b8', connecting: '#d97706', ok: '#059669', error: '#dc2626' }[state];
  const Icon = { off: Printer, connecting: Loader2, ok: CheckCircle2, error: AlertCircle }[state];

  return (
    <>
      {/* Floating-Badge unten rechts */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Druck-Agent (QZ Tray)"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 900,
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 12px', borderRadius: 99, cursor: 'pointer',
          background: '#fff', border: `1px solid ${color}`,
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)', color,
          fontSize: 12, fontWeight: 600,
        }}
      >
        <Icon size={15} className={state === 'connecting' ? 'animate-spin' : undefined} />
        {state === 'off' ? 'Druck-Agent aus'
          : state === 'ok' ? 'Druck-Agent bereit'
          : state === 'connecting' ? 'Verbinde QZ…'
          : 'Druck-Problem'}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal__header">
              <div className="modal__head-left">
                <span className="modal__icon" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                  <Printer size={17} />
                </span>
                <div>
                  <h2 className="modal__title">Druck-Agent (QZ Tray)</h2>
                  <p className="modal__subtitle">Druckt Labels aus diesem Tab an den LAN-Drucker.</p>
                </div>
              </div>
              <button type="button" className="modal__close" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal__body">
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 14px', borderRadius: 10, border: '1px solid var(--clr-border)',
                cursor: 'pointer', marginBottom: 14,
              }}>
                <span style={{ fontSize: 13 }}>
                  <strong>Druck-Agent aktiv</strong> — pollt + druckt automatisch
                </span>
                <input type="checkbox" checked={cfg.enabled}
                  onChange={(e) => save({ ...cfg, enabled: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }} />
              </label>

              <div className="modal-grid-2">
                <label className="modal-field">
                  <span className="modal-field__label">Drucker-IP</span>
                  <input className="modal-input" value={cfg.host}
                    onChange={(e) => save({ ...cfg, host: e.target.value.trim() })} />
                </label>
                <label className="modal-field">
                  <span className="modal-field__label">Port</span>
                  <input className="modal-input" type="number" value={cfg.port}
                    onChange={(e) => save({ ...cfg, port: Number(e.target.value) })} />
                </label>
              </div>
              <label className="modal-field">
                <span className="modal-field__label">Format</span>
                <select className="modal-input" value={cfg.format}
                  onChange={(e) => save({ ...cfg, format: e.target.value as 'pdf' | 'raw' })}>
                  <option value="pdf">PDF (Standard-/Pixeldruck)</option>
                  <option value="raw">RAW / ZPL (Zebra-Thermodrucker)</option>
                </select>
                <span className="modal-field__hint">
                  Pulpo liefert PDF. Falls der Drucker nur ZPL versteht → RAW wählen
                  (dann ggf. Konvertierung nötig — sag uns Bescheid).
                </span>
              </label>

              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 10,
                background: '#f8fafc', border: '1px solid var(--clr-border)', fontSize: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
                  <Icon size={14} className={state === 'connecting' ? 'animate-spin' : undefined} />
                  <strong>
                    {state === 'off' ? 'Aus'
                      : state === 'ok' ? 'QZ Tray verbunden'
                      : state === 'connecting' ? 'Verbinde mit QZ Tray…'
                      : 'Problem'}
                  </strong>
                </div>
                {lastMsg && <div style={{ color: '#059669', marginTop: 6 }}>{lastMsg}</div>}
                {lastErr && <div style={{ color: '#dc2626', marginTop: 6, wordBreak: 'break-all' }}>{lastErr}</div>}
              </div>

              <p style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 12, lineHeight: 1.5 }}>
                Hinweis: Dieser Tab muss geöffnet bleiben, solange gedruckt wird.
                QZ Tray muss auf diesem PC laufen. Beim ersten Druck ggf. einmal
                im QZ-Tray-Dialog „Allow" bestätigen.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
