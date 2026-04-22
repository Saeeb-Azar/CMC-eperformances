import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import { Server, Search, Wifi, WifiOff, MoreVertical } from 'lucide-react';
import { api, type MachineRead, type TenantRead } from '../../services/api';

const formatHeartbeat = (iso: string | null): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
};

export default function ControlMachinesPage() {
  const { t } = useTranslation();
  const [machines, setMachines] = useState<MachineRead[]>([]);
  const [tenants, setTenants] = useState<TenantRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [m, t] = await Promise.allSettled([api.listMachines(), api.listTenants()]);
      if (cancelled) return;
      if (m.status === 'fulfilled') setMachines(m.value);
      else setMachines([]);
      if (t.status === 'fulfilled') setTenants(t.value);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const tenantById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tenants) map.set(t.id, t.name);
    return map;
  }, [tenants]);

  const filtered = machines.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.machine_id.toLowerCase().includes(q) || m.tcp_host.includes(q);
  });

  return (
    <div>
      <Topbar title={t('control.machines.title')} subtitle={t('control.machines.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('control.machines.pageTitle')}</h1>
            <p className="page-header__desc">{t('control.machines.pageDesc')}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid-4 gap-4">
          {[
            { label: t('control.machines.totalMachines'), value: machines.length },
            { label: t('common.online'), value: machines.filter(m => m.is_online).length },
            { label: t('common.offline'), value: machines.filter(m => !m.is_online).length },
            { label: t('common.active'), value: machines.filter(m => m.is_active).length },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('control.machines.searchPlaceholder')}
            className="input input--with-icon"
          />
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t('machines.machine')}</th>
                <th style={{ width: 170 }}>{t('control.machines.tenant')}</th>
                <th style={{ width: 100 }}>{t('common.status')}</th>
                <th style={{ width: 90 }}>{t('machines.sequence')}</th>
                <th style={{ width: 90 }}>{t('common.heartbeat')}</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.noData')}</td></tr>
              ) : (
                filtered.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${m.is_online ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                        <Server size={16} className={m.is_online ? 'text-emerald-600' : 'text-gray-400'} />
                      </div>
                    </td>
                    <td>
                      <span className="cell-primary block">{m.name}</span>
                      <span className="cell-muted block mt-0.5">{m.model} · ID: {m.machine_id} · {m.tcp_host}:{m.tcp_port}</span>
                    </td>
                    <td>{tenantById.get(m.tenant_id) ?? <span className="cell-muted">{m.tenant_id.slice(0, 8)}</span>}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {m.is_online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-gray-400" />}
                        <StatusBadge status={m.status} />
                      </div>
                    </td>
                    <td><span className="cell-mono tabular-nums">{m.enq_sequence.toLocaleString()}</span></td>
                    <td><span className="cell-muted">{formatHeartbeat(m.last_heartbeat_at)}</span></td>
                    <td><button className="btn-icon"><MoreVertical size={14} /></button></td>
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
