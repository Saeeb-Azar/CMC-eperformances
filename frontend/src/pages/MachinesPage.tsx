import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import { Server, Wifi, WifiOff, Tag, FileText, Ruler } from 'lucide-react';
import { api, type MachineRead } from '../services/api';

const formatHeartbeat = (iso: string | null): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
};

export default function MachinesPage() {
  const { t } = useTranslation();
  const [machines, setMachines] = useState<MachineRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.listMachines()
        .then((m) => { if (!cancelled) { setMachines(m); setLoading(false); } })
        .catch(() => { if (!cancelled) { setMachines([]); setLoading(false); } });
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div>
      <Topbar title={t('machines.title')} subtitle={t('machines.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('machines.pageTitle')}</h1>
            <p className="page-header__desc">{t('machines.pageDesc')}</p>
          </div>
          <button className="btn btn--primary btn--lg">{t('machines.addMachine')}</button>
        </div>

        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t('machines.machine')}</th>
                <th style={{ width: 100 }}>{t('common.status')}</th>
                <th style={{ width: 90 }}>{t('machines.sequence')}</th>
                <th style={{ width: 100 }}>{t('common.heartbeat')}</th>
                <th style={{ width: 160 }}>{t('machines.maxDimensions')}</th>
                <th style={{ width: 130 }}>{t('machines.stations')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : machines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                      <span>{t('common.noData')}</span>
                      <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', maxWidth: 520, lineHeight: 1.5 }}>
                        {t('machines.autoProvisionHint')}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                machines.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${m.is_online ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                        <Server size={16} className={m.is_online ? 'text-emerald-600' : 'text-gray-400'} />
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="cell-primary block">{m.name}</span>
                        <span className="cell-muted block mt-0.5">{m.model} · ID: {m.machine_id} · {m.tcp_host}:{m.tcp_port}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {m.is_online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-gray-400" />}
                        <StatusBadge status={m.status} />
                      </div>
                    </td>
                    <td>
                      <span className="cell-mono tabular-nums">{m.enq_sequence.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="cell-muted">{formatHeartbeat(m.last_heartbeat_at)}</span>
                    </td>
                    <td>
                      <span className="cell-muted flex items-center gap-1">
                        <Ruler size={12} className="text-gray-400" />
                        {m.max_length_mm / 10}×{m.max_width_mm / 10}×{m.max_height_mm / 10} cm
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`flex items-center gap-0.5 ${m.lab1_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={10} /> LAB1</span>
                        <span className={`flex items-center gap-0.5 ${m.lab2_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={10} /> LAB2</span>
                        <span className={`flex items-center gap-0.5 ${m.inv_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><FileText size={10} /> INV</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
