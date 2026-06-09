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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--clr-border, #d1d5db)', borderRadius: 8,
  background: '#fff', boxSizing: 'border-box',
};

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, background: '#fff', borderRadius: 16,
          boxShadow: '0 20px 50px rgba(15,23,42,0.3)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 22px', borderBottom: '1px solid #eef0f3',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: '#0f172a',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Server size={17} /></div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {isEdit ? t('machines.form.editTitle', 'Maschine bearbeiten') : t('machines.form.title')}
              </h2>
              <p style={{ fontSize: 12, color: '#6b7280' }}>{t('machines.form.subtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.cancel')}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '20px 22px', background: '#f8fafc', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
              {error}
            </div>
          )}

          <Section icon={<Cpu size={15} />} title={t('machines.form.sectionBasics', 'Basisdaten')}>
            <Grid2>
              <Field label={t('machines.form.machineId')} hint={t('machines.form.machineIdHint')}>
                <input type="text" value={form.machine_id} onChange={(e) => update('machine_id', e.target.value)}
                  style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }} required disabled={isEdit} />
              </Field>
              <Field label={t('machines.form.name')}>
                <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} style={inputStyle} required />
              </Field>
            </Grid2>
            <Grid2>
              <Field label={t('machines.form.model')}>
                <select value={form.model ?? 'CW1000'} onChange={(e) => update('model', e.target.value)} style={inputStyle}>
                  <option value="CW1000">CW1000</option>
                  <option value="CW XS">CW XS</option>
                  <option value="CW XL">CW XL</option>
                </select>
              </Field>
              <Field label={t('machines.form.tcpRole')}>
                <select value={form.tcp_role} onChange={(e) => update('tcp_role', e.target.value as 'server' | 'client')} style={inputStyle}>
                  <option value="server">{t('machines.form.roleServer')}</option>
                  <option value="client">{t('machines.form.roleClient')}</option>
                </select>
              </Field>
            </Grid2>
          </Section>

          <Grid2>
            <Section icon={<Network size={15} />} title={t('machines.form.sectionNetwork', 'Netzwerk')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
                <Field label={t('machines.form.tcpHost')}>
                  <input type="text" value={form.tcp_host ?? ''} onChange={(e) => update('tcp_host', e.target.value)} style={inputStyle} />
                </Field>
                <Field label={t('machines.form.tcpPort')}>
                  <input type="number" value={form.tcp_port ?? 15001} onChange={(e) => update('tcp_port', Number(e.target.value))} style={inputStyle} />
                </Field>
              </div>
            </Section>
            <Section icon={<Boxes size={15} />} title={t('machines.form.sectionPulpo', 'Pulpo Integration')}>
              <Field
                label={t('machines.form.pulpoPickLocation', 'Pulpo Pick-Location')}
                hint={t('machines.form.pulpoPickLocationHint', 'origin_location_code in Pulpo. Gesetzt = CW-Liste wird automatisch aus der Pulpo-Queue befüllt. Leer = keine Pulpo-Anbindung.')}
              >
                <input type="text" value={form.pulpo_pick_location ?? ''} onChange={(e) => update('pulpo_pick_location', e.target.value)}
                  style={inputStyle} placeholder="z.B. Standard" />
              </Field>
            </Section>
          </Grid2>

          <Section icon={<Ruler size={15} />} title={t('machines.form.maxDimensions')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Field label="L (mm)">
                <input type="number" value={form.max_length_mm ?? 6000} onChange={(e) => update('max_length_mm', Number(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="B (mm)">
                <input type="number" value={form.max_width_mm ?? 4000} onChange={(e) => update('max_width_mm', Number(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="H (mm)">
                <input type="number" value={form.max_height_mm ?? 3000} onChange={(e) => update('max_height_mm', Number(e.target.value))} style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section icon={<Layers size={15} />} title={t('machines.form.stations')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <ToggleField checked={!!form.lab1_enabled} onChange={(v) => update('lab1_enabled', v)} label="LAB1" />
              <ToggleField checked={!!form.lab2_enabled} onChange={(v) => update('lab2_enabled', v)} label="LAB2" />
              <ToggleField checked={!!form.inv_enabled} onChange={(v) => update('inv_enabled', v)} label="INV" />
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '14px 22px', borderTop: '1px solid #eef0f3', background: '#fff',
        }}>
          <button type="button" onClick={onClose}
            style={{ height: 40, padding: '0 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={loading}
            style={{
              height: 40, padding: '0 18px', borderRadius: 8, border: 'none',
              background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>
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
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#3b82f6', display: 'inline-flex' }}>{icon}</span>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginTop: 5, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

function ToggleField({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40,
      borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${checked ? '#a7f3d0' : '#e5e7eb'}`,
      background: checked ? '#ecfdf5' : '#fff',
      color: checked ? '#047857' : '#6b7280',
    }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: '#059669', cursor: 'pointer' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{label}</span>
    </label>
  );
}
