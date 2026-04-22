import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Server, Loader2 } from 'lucide-react';
import { api, type MachineCreateInput, type MachineRead } from '../../services/api';

interface MachineFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (machine: MachineRead) => void;
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
};

export default function MachineFormModal({ open, onClose, onCreated }: MachineFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<MachineCreateInput>(DEFAULTS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form each time the modal opens.
  useEffect(() => {
    if (open) {
      setForm(DEFAULTS);
      setError('');
    }
  }, [open]);

  // Close on Escape for keyboard users.
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
      const created = await api.createMachine(form);
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('machines.form.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Server size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('machines.form.title')}</h2>
              <p className="text-xs text-gray-500">{t('machines.form.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center"
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('machines.form.machineId')} hint={t('machines.form.machineIdHint')}>
              <input
                type="text"
                value={form.machine_id}
                onChange={(e) => update('machine_id', e.target.value)}
                className="input"
                required
              />
            </Field>
            <Field label={t('machines.form.name')}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="input"
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('machines.form.model')}>
              <input
                type="text"
                value={form.model ?? ''}
                onChange={(e) => update('model', e.target.value)}
                className="input"
              />
            </Field>
            <Field label={t('machines.form.tcpRole')}>
              <select
                value={form.tcp_role}
                onChange={(e) => update('tcp_role', e.target.value as 'server' | 'client')}
                className="input"
              >
                <option value="server">{t('machines.form.roleServer')}</option>
                <option value="client">{t('machines.form.roleClient')}</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-4">
            <Field label={t('machines.form.tcpHost')}>
              <input
                type="text"
                value={form.tcp_host ?? ''}
                onChange={(e) => update('tcp_host', e.target.value)}
                className="input"
              />
            </Field>
            <Field label={t('machines.form.tcpPort')}>
              <input
                type="number"
                value={form.tcp_port ?? 15001}
                onChange={(e) => update('tcp_port', Number(e.target.value))}
                className="input"
              />
            </Field>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">{t('machines.form.maxDimensions')}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="L (mm)">
                <input
                  type="number"
                  value={form.max_length_mm ?? 6000}
                  onChange={(e) => update('max_length_mm', Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="B (mm)">
                <input
                  type="number"
                  value={form.max_width_mm ?? 4000}
                  onChange={(e) => update('max_width_mm', Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="H (mm)">
                <input
                  type="number"
                  value={form.max_height_mm ?? 3000}
                  onChange={(e) => update('max_height_mm', Number(e.target.value))}
                  className="input"
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">{t('machines.form.stations')}</p>
            <div className="grid grid-cols-3 gap-3">
              <ToggleField
                checked={!!form.lab1_enabled}
                onChange={(v) => update('lab1_enabled', v)}
                label="LAB1"
              />
              <ToggleField
                checked={!!form.lab2_enabled}
                onChange={(v) => update('lab2_enabled', v)}
                label="LAB2"
              />
              <ToggleField
                checked={!!form.inv_enabled}
                onChange={(v) => update('inv_enabled', v)}
                label="INV"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="h-10 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? t('common.loading') : t('machines.form.create')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function ToggleField({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label
      className={`flex items-center gap-2 px-3 h-10 rounded-lg border text-sm cursor-pointer transition-colors ${
        checked ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-600'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-emerald-600"
      />
      <span className="font-mono text-xs">{label}</span>
    </label>
  );
}
