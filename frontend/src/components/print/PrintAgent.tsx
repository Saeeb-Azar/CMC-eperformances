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
import { Printer, X, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { qzConnect, qzIsConnected, qzPrintLabel, type PrinterTarget } from '../../services/qzTray';

interface AgentCfg {
  enabled: boolean;
  /** Windows-Druckername (z.B. "DR_CW") — bevorzugter Weg, wie Pulpo es auch macht. */
  printerName: string;
  /** Direkte Netzwerk-Adresse — nur falls Drucker NICHT im OS installiert ist. */
  host: string;
  port: number;
  /** "name" = via Windows-Druckername (Standard), "host" = direkt per TCP. */
  mode: 'name' | 'host';
  format: 'pdf' | 'raw';
}

const LS_KEY = 'cmc.printAgent';
const DEFAULT_CFG: AgentCfg = {
  enabled: false, printerName: 'DR_CW',
  host: '192.168.1.120', port: 9100,
  mode: 'name', format: 'pdf',
};

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

  // Fehlgeschlagene Druckjobs (zum Aufräumen / erneut drucken).
  type Problem = { id: string; reference_id: string; tracking_number: string; print_error: string; created_at: string };
  const [problems, setProblems] = useState<Problem[]>([]);
  const loadProblems = useCallback(async () => {
    try { setProblems(await api.getPrintProblems()); } catch { /* ignore */ }
  }, []);
  const doRetry = async (id: string) => {
    try { await api.retryPrint(id); await loadProblems(); }
    catch (e) { setLastErr(e instanceof Error ? e.message : String(e)); }
  };
  const doDelete = async (id: string) => {
    try { await api.deletePrintEntry(id); await loadProblems(); }
    catch (e) { setLastErr(e instanceof Error ? e.message : String(e)); }
  };
  const doClearAll = async () => {
    if (!window.confirm('Alle fehlgeschlagenen Druckjobs unwiderruflich löschen?')) return;
    try { const r = await api.clearPrintProblems(); setLastMsg(`${r.deleted} Druck-Probleme gelöscht`); await loadProblems(); }
    catch (e) { setLastErr(e instanceof Error ? e.message : String(e)); }
  };

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
      const target: PrinterTarget = cfg.mode === 'name'
        ? { name: cfg.printerName, format: cfg.format }
        : { host: cfg.host, port: cfg.port, format: cfg.format };
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

  // Druck-Probleme laden, solange das Panel offen ist.
  useEffect(() => {
    if (!open) return;
    loadProblems();
    const id = setInterval(loadProblems, 4000);
    return () => clearInterval(id);
  }, [open, loadProblems]);

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

              <label className="modal-field">
                <span className="modal-field__label">Drucker-Auswahl</span>
                <select className="modal-input" value={cfg.mode}
                  onChange={(e) => save({ ...cfg, mode: e.target.value as 'name' | 'host' })}>
                  <option value="name">Über Windows-Druckername (empfohlen)</option>
                  <option value="host">Direkt über Netzwerk-Adresse (host:port)</option>
                </select>
                <span className="modal-field__hint">
                  Pulpo druckt über den installierten Druckernamen (im QZ-Log:
                  {' '}<code>printer.name=DR_CW</code>). Das ist der zuverlässigste Weg.
                </span>
              </label>

              {cfg.mode === 'name' ? (
                <label className="modal-field">
                  <span className="modal-field__label">Drucker-Name (Windows)</span>
                  <input className="modal-input" value={cfg.printerName}
                    onChange={(e) => save({ ...cfg, printerName: e.target.value.trim() })}
                    placeholder="DR_CW" />
                  <span className="modal-field__hint">
                    Exakt wie in Windows → „Geräte und Drucker" angezeigt.
                  </span>
                </label>
              ) : (
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
              )}

              <label className="modal-field">
                <span className="modal-field__label">Format</span>
                <select className="modal-input" value={cfg.format}
                  onChange={(e) => save({ ...cfg, format: e.target.value as 'pdf' | 'raw' })}>
                  <option value="pdf">PDF (Standard-/Pixeldruck)</option>
                  <option value="raw">RAW / ZPL (Zebra-Thermodrucker)</option>
                </select>
                <span className="modal-field__hint">
                  Pulpo liefert PDF. Falls der Drucker nur ZPL versteht → RAW wählen.
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

              {/* Druck-Probleme: aufräumen / erneut drucken */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>Druck-Probleme ({problems.length})</strong>
                  {problems.length > 0 && (
                    <button type="button" onClick={doClearAll}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                        background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                        fontSize: 12, fontWeight: 600,
                      }}>
                      <Trash2 size={13} /> Alle löschen
                    </button>
                  )}
                </div>
                {problems.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
                    Keine fehlgeschlagenen Druckjobs. 👍
                  </div>
                ) : (
                  <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {problems.map((p) => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        padding: '8px 10px', borderRadius: 8, border: '1px solid var(--clr-border)', background: '#fff',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>
                            {p.reference_id} · {p.tracking_number}
                          </div>
                          <div style={{ fontSize: 11, color: '#dc2626', wordBreak: 'break-all' }}>{p.print_error}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button type="button" title="Erneut drucken" onClick={() => doRetry(p.id)}
                            style={{ display: 'inline-flex', padding: 6, borderRadius: 7, cursor: 'pointer',
                              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
                            <RefreshCw size={14} />
                          </button>
                          <button type="button" title="Löschen" onClick={() => doDelete(p.id)}
                            style={{ display: 'inline-flex', padding: 6, borderRadius: 7, cursor: 'pointer',
                              background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
