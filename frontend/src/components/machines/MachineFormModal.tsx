import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Server, Loader2, Cpu, Network, Boxes, Ruler, Layers } from 'lucide-react';
import { api, type MachineCreateInput, type MachineRead } from '../../services/api';

interface MachineFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (machine: MachineRead) => void;
  /** When set, the modal edits this machine instead of creating a new one. */
  machine?: MachineRead | null;
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

export default function MachineFormModal({ open, onClose, onCreated, machine }: MachineFormModalProps) {
  const { t } = useTranslation();
  const isEdit = !!machine;
  const [form, setForm] = useState<MachineCreateInput>(DEFAULTS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(machine ? fromMachine(machine) : DEFAULTS);
      setError('');
    }
  }, [open, machine]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.machine_id || !form.name) {
      setError(t('machines.form.errorRequired'));
      return;
    }
    setLoading(true);
    try {
      const saved = isEdit && machine
        ? await api.updateMachine(machine.id, form)
        : await api.createMachine(form);
      onCreated(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('machines.form.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal modal--lg" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal__header">
          <div className="modal__head-left">
            <span className="modal__icon"><Server size={17} /></span>
            <div>
              <h2 className="modal__title">
                {isEdit ? t('machines.form.editTitle', 'Maschine bearbeiten') : t('machines.form.title')}
              </h2>
              <p className="modal__subtitle">{t('machines.form.subtitle')}</p>
            </div>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal__body">
          {error && <div className="modal-error">{error}</div>}

          <Section icon={<Cpu size={15} />} title={t('machines.form.sectionBasics', 'Basisdaten')}>
            <div className="modal-grid-2">
              <Field label={t('machines.form.machineId')} hint={t('machines.form.machineIdHint')}>
                <input type="text" className="modal-input" value={form.machine_id}
                  onChange={(e) => update('machine_id', e.target.value)} required disabled={isEdit} />
              </Field>
              <Field label={t('machines.form.name')}>
                <input type="text" className="modal-input" value={form.name}
                  onChange={(e) => update('name', e.target.value)} required />
              </Field>
            </div>
            <div className="modal-grid-2">
              <Field label={t('machines.form.model')}>
                <select className="modal-input" value={form.model ?? 'CW1000'} onChange={(e) => update('model', e.target.value)}>
                  <option value="CW1000">CW1000</option>
                  <option value="CW XS">CW XS</option>
                  <option value="CW XL">CW XL</option>
                </select>
              </Field>
              <Field label={t('machines.form.tcpRole')}>
                <select className="modal-input" value={form.tcp_role}
                  onChange={(e) => update('tcp_role', e.target.value as 'server' | 'client')}>
                  <option value="server">{t('machines.form.roleServer')}</option>
                  <option value="client">{t('machines.form.roleClient')}</option>
                </select>
              </Field>
            </div>
          </Section>

          <div className="modal-grid-2">
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
            <Section icon={<Boxes size={15} />} title={t('machines.form.sectionPulpo', 'Pulpo Integration')}>
              <Field
                label={t('machines.form.pulpoPickLocation', 'Pulpo Pick-Location')}
                hint={t('machines.form.pulpoPickLocationHint', 'Lagerplatz-Präfix in Pulpo. „CW" matcht CW1/CW6/CW10 (CartonWrap) und schließt SACK-Plätze aus. Leer = ganze Queue.')}
              >
                <input type="text" className="modal-input" value={form.pulpo_pick_location ?? ''}
                  onChange={(e) => update('pulpo_pick_location', e.target.value)} placeholder="z.B. CW" />
              </Field>
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
        </div>

        {/* Footer */}
        <div className="modal__footer">
          <button type="button" className="modal-btn modal-btn--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="modal-btn modal-btn--primary" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
            {loading ? t('common.loading') : isEdit ? t('common.save', 'Speichern') : t('machines.form.create')}
          </button>
        </div>
      </form>
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
