import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Server, Loader2, Network, Boxes, Ruler, Layers, Link2, Copy, Check,
  ChevronDown, ChevronRight, CheckCircle2, Wifi, Info, Trash2,
} from 'lucide-react';
import { api, type MachineCreateInput, type MachineRead } from '../../services/api';

interface MachineFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (machine: MachineRead) => void;
  /** When set, the modal edits this machine instead of creating a new one. */
  machine?: MachineRead | null;
  /** Prefill für die Maschinen-ID — z.B. aus „unbekannte Verbindung erkannt". */
  initialMachineId?: string | null;
  /** Nach erfolgreichem Löschen (nur Edit-Modus relevant). */
  onDeleted?: () => void;
}

const DEFAULTS: MachineCreateInput = {
  machine_id: '0001',
  name: 'CW-001',
  model: 'CW1000',
  tcp_role: 'server',
  tcp_host: '0.0.0.0',
  tcp_port: 15001,
  lab1_enabled: true,
  lab2_enabled: false,
  inv_enabled: false,
  pre_create_labels: true,
  max_length_mm: 6000,
  max_width_mm: 4000,
  max_height_mm: 3000,
  pulpo_pick_location: '',
};

function fromMachine(m: MachineRead): MachineCreateInput {
  return {
    machine_id: m.machine_id,
    name: m.name,
    model: m.model,
    tcp_role: m.tcp_role as 'server' | 'client',
    tcp_host: m.tcp_host,
    tcp_port: m.tcp_port,
    lab1_enabled: m.lab1_enabled,
    lab2_enabled: m.lab2_enabled,
    inv_enabled: m.inv_enabled,
    pre_create_labels: m.pre_create_labels,
    max_length_mm: m.max_length_mm,
    max_width_mm: m.max_width_mm,
    max_height_mm: m.max_height_mm,
    pulpo_pick_location: m.pulpo_pick_location ?? '',
  };
}

export default function MachineFormModal({ open, onClose, onCreated, machine, initialMachineId, onDeleted }: MachineFormModalProps) {
  const { t } = useTranslation();
  const isEdit = !!machine;
  const [form, setForm] = useState<MachineCreateInput>(DEFAULTS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Nach erfolgreichem Anlegen: Verbindungs-Check-Ansicht statt Formular.
  const [created, setCreated] = useState<MachineRead | null>(null);

  useEffect(() => {
    if (open) {
      const base = machine ? fromMachine(machine) : DEFAULTS;
      setForm(initialMachineId && !machine
        ? { ...base, machine_id: initialMachineId, name: `CW-${initialMachineId}` }
        : base);
      setError('');
      setCreated(null);
      setShowAdvanced(!!machine);
    }
  }, [open, machine, initialMachineId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const update = <K extends keyof MachineCreateInput>(key: K, value: MachineCreateInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDelete = async () => {
    if (!machine) return;
    if (!window.confirm(`Maschine „${machine.name}“ (ID ${machine.machine_id}) wirklich löschen?\nHeartbeats und Auftrags-Historie dieser Maschine werden mit entfernt.`)) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteMachine(machine.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.machine_id.trim() || !form.name.trim()) {
      setError('Maschinen-ID und Name sind Pflichtfelder.');
      return;
    }
    setLoading(true);
    try {
      const saved = isEdit && machine
        ? await api.updateMachine(machine.id, form)
        : await api.createMachine(form);
      onCreated(saved);
      if (isEdit) {
        onClose();
      } else {
        // Nicht schließen — direkt in den Verbindungs-Check wechseln.
        setCreated(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      {created ? (
        <ConnectionCheck machine={created} onClose={onClose} />
      ) : (
        <form className="modal modal--lg" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal__header">
            <div className="modal__head-left">
              <span className="modal__icon"><Server size={17} /></span>
              <div>
                <h2 className="modal__title">
                  {isEdit ? 'Maschine bearbeiten' : 'Maschine hinzufügen'}
                </h2>
                <p className="modal__subtitle">
                  {isEdit ? t('machines.form.subtitle') : 'Nur 2 Pflichtfelder — alles andere hat sinnvolle Defaults.'}
                </p>
              </div>
            </div>
            <button type="button" className="modal__close" onClick={onClose} aria-label={t('common.cancel')}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="modal__body">
            {error && <div className="modal-error">{error}</div>}

            {/* ── PFLICHT: Verknüpfung ─────────────────────────────── */}
            <Section icon={<Link2 size={15} />} title="Verknüpfung — Pflicht">
              {!isEdit && (
                <div style={{
                  display: 'flex', gap: 10, padding: '10px 12px', marginBottom: 12,
                  borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe',
                }}>
                  <Info size={15} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.55 }}>
                    Die <strong>Maschinen-ID</strong> verknüpft die Verbindung mit dieser Maschine:
                    Sie muss <strong>exakt</strong> der ID entsprechen, die die Maschine sendet
                    (am CMC-HMI / Simulator das Feld <strong>„MachineID"</strong>, z.B. <code>0001</code>).
                    Stimmt sie nicht überein, verbindet die Maschine zwar — wird hier aber nie angezeigt.
                  </div>
                </div>
              )}
              <div className="modal-grid-2">
                <Field
                  label="Maschinen-ID *"
                  hint={isEdit ? 'ID kann nachträglich nicht geändert werden.' : 'Muss der gesendeten CIS-ID entsprechen (z.B. 0001) — und eindeutig sein: jede ID gehört genau EINER Maschine.'}
                >
                  <input
                    type="text" className="modal-input" value={form.machine_id}
                    onChange={(e) => update('machine_id', e.target.value.trim())}
                    required disabled={isEdit} placeholder="0001"
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1 }}
                  />
                </Field>
                <Field label="Anzeigename *" hint="Frei wählbar — so heißt die Maschine im Dashboard.">
                  <input
                    type="text" className="modal-input" value={form.name}
                    onChange={(e) => update('name', e.target.value)} required placeholder="CW-001"
                  />
                </Field>
              </div>
            </Section>

            {/* ── Optional: Pulpo ──────────────────────────────────── */}
            <Section icon={<Boxes size={15} />} title="Pulpo (optional)">
              <Field
                label="Pick-Location-Präfix"
                hint={'Leer = ganze Pulpo-Queue (alle Lagerplätze). „CW2“ = nur CW2*. „CW“ = CW1/CW6/CW10…, schließt SACK aus.'}
              >
                <input type="text" className="modal-input" value={form.pulpo_pick_location ?? ''}
                  onChange={(e) => update('pulpo_pick_location', e.target.value)} placeholder="leer = alle" />
              </Field>
            </Section>

            {/* ── Erweitert (optional, eingeklappt) ─────────────────── */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '10px 12px', borderRadius: 10, marginBottom: showAdvanced ? 12 : 0,
                border: '1px dashed var(--clr-border)', background: 'transparent',
                fontSize: 12.5, fontWeight: 600, color: 'var(--clr-text-muted)', cursor: 'pointer',
              }}
            >
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Erweiterte Einstellungen (optional) — Modell, Netzwerk, Maße, Stationen
            </button>

            {showAdvanced && (
              <>
                <div className="modal-grid-2">
                  <Section icon={<Server size={15} />} title="Modell & Rolle">
                    <Field label={t('machines.form.model')}>
                      <select className="modal-input" value={form.model ?? 'CW1000'} onChange={(e) => update('model', e.target.value)}>
                        <option value="CW1000">CW1000</option>
                        <option value="CW XS">CW XS</option>
                        <option value="CW XL">CW XL</option>
                      </select>
                    </Field>
                    <Field label={t('machines.form.tcpRole')} hint="Standard: Maschine verbindet sich zu uns (Server).">
                      <select className="modal-input" value={form.tcp_role}
                        onChange={(e) => update('tcp_role', e.target.value as 'server' | 'client')}>
                        <option value="server">{t('machines.form.roleServer')}</option>
                        <option value="client">{t('machines.form.roleClient')}</option>
                      </select>
                    </Field>
                  </Section>
                  <Section icon={<Network size={15} />} title={t('machines.form.sectionNetwork', 'Netzwerk')}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
                      <Field label={t('machines.form.tcpHost')}>
                        <input type="text" className="modal-input" value={form.tcp_host ?? ''}
                          onChange={(e) => update('tcp_host', e.target.value)} />
                      </Field>
                      <Field label={t('machines.form.tcpPort')}>
                        <input type="number" className="modal-input" value={form.tcp_port ?? 15001}
                          onChange={(e) => update('tcp_port', Number(e.target.value))} />
                      </Field>
                    </div>
                  </Section>
                </div>

                <Section icon={<Ruler size={15} />} title={t('machines.form.maxDimensions')}>
                  <div className="modal-grid-3">
                    <Field label="L (mm)">
                      <input type="number" className="modal-input" value={form.max_length_mm ?? 6000}
                        onChange={(e) => update('max_length_mm', Number(e.target.value))} />
                    </Field>
                    <Field label="B (mm)">
                      <input type="number" className="modal-input" value={form.max_width_mm ?? 4000}
                        onChange={(e) => update('max_width_mm', Number(e.target.value))} />
                    </Field>
                    <Field label="H (mm)">
                      <input type="number" className="modal-input" value={form.max_height_mm ?? 3000}
                        onChange={(e) => update('max_height_mm', Number(e.target.value))} />
                    </Field>
                  </div>
                </Section>

                <Section icon={<Layers size={15} />} title={t('machines.form.stations')}>
                  <div className="modal-grid-3">
                    <ToggleField checked={!!form.lab1_enabled} onChange={(v) => update('lab1_enabled', v)} label="LAB1" />
                    <ToggleField checked={!!form.lab2_enabled} onChange={(v) => update('lab2_enabled', v)} label="LAB2" />
                    <ToggleField checked={!!form.inv_enabled} onChange={(v) => update('inv_enabled', v)} label="INV" />
                  </div>
                </Section>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="modal__footer" style={isEdit ? { justifyContent: 'space-between' } : undefined}>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #fecaca', background: '#fef2f2',
                  fontSize: 12.5, fontWeight: 600, color: '#991b1b',
                }}
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Maschine löschen
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="modal-btn modal-btn--ghost" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="modal-btn modal-btn--primary" disabled={loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
                {loading ? t('common.loading') : isEdit ? t('common.save', 'Speichern') : 'Anlegen & Verbindung prüfen'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

/** Nach dem Anlegen: Live-Check, ob die Maschine sich verbindet, plus die
 *  Schritt-für-Schritt-Anleitung mit der Gateway-Adresse zum Kopieren. */
function ConnectionCheck({ machine, onClose }: { machine: MachineRead; onClose: () => void }) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api.getGatewayStatus()
        .then((g) => {
          if (cancelled) return;
          setConnected((g.connected_machines ?? []).includes(machine.machine_id));
          if (g.public_tcp_address) setAddress(g.public_tcp_address);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [machine.machine_id]);

  const copy = () => {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
      <div className="modal__header">
        <div className="modal__head-left">
          <span className="modal__icon" style={{ background: '#ecfdf5', color: '#059669' }}>
            <CheckCircle2 size={17} />
          </span>
          <div>
            <h2 className="modal__title">„{machine.name}" angelegt</h2>
            <p className="modal__subtitle">Jetzt die Maschine verbinden — wir warten live.</p>
          </div>
        </div>
        <button type="button" className="modal__close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="modal__body">
        {/* Live-Status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          borderRadius: 12, marginBottom: 16,
          background: connected ? '#ecfdf5' : '#fffbeb',
          border: `1px solid ${connected ? '#a7f3d0' : '#fde68a'}`,
        }}>
          {connected
            ? <Wifi size={20} style={{ color: '#059669' }} />
            : <Loader2 size={20} className="animate-spin" style={{ color: '#d97706' }} />}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: connected ? '#065f46' : '#92400e' }}>
              {connected ? 'Verbunden! Maschine ist online.' : `Warte auf Verbindung von ID ${machine.machine_id} …`}
            </div>
            <div style={{ fontSize: 11.5, color: connected ? '#047857' : '#a16207' }}>
              {connected
                ? 'Die Maschine sendet — du findest sie jetzt im Dashboard.'
                : 'Sobald die Maschine ein HBT/ENQ mit dieser ID sendet, springt der Status hier um.'}
            </div>
          </div>
        </div>

        {/* Anleitung */}
        {!connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <StepRow n={1}>
              An der Maschine den <strong>CIS Connection Manager</strong> öffnen
              (Data Origin: <strong>External / Data Server</strong>).
            </StepRow>
            <StepRow n={2}>
              {address ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  Als Data-Server-Adresse eintragen:
                  <code style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5,
                    padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid var(--clr-border)',
                  }}>{address}</code>
                  <button type="button" onClick={copy} title="Kopieren" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                    borderRadius: 6, border: '1px solid var(--clr-border)', background: '#fff',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', color: copied ? '#059669' : 'var(--clr-text-muted)',
                  }}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Kopiert' : 'Kopieren'}
                  </button>
                </span>
              ) : (
                <>Die <strong>Gateway-Adresse</strong> (IP + Port) als Data-Server eintragen.
                  {' '}Cloud: Railway-TCP-Proxy-Adresse · Lokal: <code>&lt;Server-IP&gt;:15001</code>.</>
              )}
            </StepRow>
            <StepRow n={3}>
              <strong>MachineID</strong> an der Maschine prüfen: muss <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{machine.machine_id}</code> sein.
            </StepRow>
            <StepRow n={4}>
              <strong>Reset</strong> drücken, dann <strong>„Send HeatBeat"</strong> — der Status oben springt automatisch um.
            </StepRow>
          </div>
        )}
      </div>

      <div className="modal__footer">
        <button type="button" className="modal-btn modal-btn--primary" onClick={onClose}>
          {connected ? 'Fertig' : 'Später verbinden — schließen'}
        </button>
      </div>
    </div>
  );
}

function StepRow({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{
        width: 20, height: 20, borderRadius: 99, flexShrink: 0, marginTop: 1,
        background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="modal-section">
      <div className="modal-section__head">
        <span className="modal-section__icon">{icon}</span>
        <h3 className="modal-section__title">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="modal-field">
      <span className="modal-field__label">{label}</span>
      {children}
      {hint && <span className="modal-field__hint">{hint}</span>}
    </label>
  );
}

function ToggleField({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={`modal-toggle ${checked ? 'modal-toggle--on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
