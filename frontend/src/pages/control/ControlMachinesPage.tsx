import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import DataTable, { type Column, type FilterState } from '../../components/ui/DataTable';
import { Server, Wifi, WifiOff, MoreVertical } from 'lucide-react';
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
  const [filterState, setFilterState] = useState<FilterState>({ online: [], tenant: [] });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [m, ts] = await Promise.allSettled([api.listMachines(), api.listTenants()]);
      if (cancelled) return;
      if (m.status === 'fulfilled') setMachines(m.value); else setMachines([]);
      if (ts.status === 'fulfilled') setTenants(ts.value);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const tenantById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ten of tenants) map.set(ten.id, ten.name);
    return map;
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return machines.filter((m) => {
      if (q && !`${m.name} ${m.machine_id} ${m.tcp_host}`.toLowerCase().includes(q)) return false;
      const onlineSel = filterState.online ?? [];
      if (onlineSel.length > 0) {
        const wantOn = onlineSel.includes('online');
        const wantOff = onlineSel.includes('offline');
        if (m.is_online && !wantOn) return false;
        if (!m.is_online && !wantOff) return false;
      }
      const tenantSel = filterState.tenant ?? [];
      if (tenantSel.length > 0 && !tenantSel.includes(m.tenant_id)) return false;
      return true;
    });
  }, [machines, search, filterState]);

  const columns: Column<MachineRead>[] = [
    {
      key: 'icon',
      header: '',
      width: 56,
      render: (m) => (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${m.is_online ? 'bg-emerald-50' : 'bg-gray-100'}`}>
          <Server size={16} className={m.is_online ? 'text-emerald-600' : 'text-gray-400'} />
        </div>
      ),
    },
    {
      key: 'machine',
      header: t('machines.machine'),
      render: (m) => (
        <div>
          <span className="cell-primary block">{m.name}</span>
          <span className="cell-muted block mt-0.5">{m.model} · ID: {m.machine_id} · {m.tcp_host}:{m.tcp_port}</span>
        </div>
      ),
    },
    {
      key: 'tenant',
      header: t('control.machines.tenant'),
      width: 180,
      render: (m) => tenantById.get(m.tenant_id) ?? <span className="cell-muted">{m.tenant_id.slice(0, 8)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      width: 130,
      render: (m) => (
        <div className="flex items-center gap-2">
          {m.is_online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-gray-400" />}
          <StatusBadge status={m.status} />
        </div>
      ),
    },
    {
      key: 'sequence',
      header: t('machines.sequence'),
      width: 100,
      render: (m) => <span className="cell-mono tabular-nums">{m.enq_sequence.toLocaleString()}</span>,
    },
    {
      key: 'heartbeat',
      header: t('common.heartbeat'),
      width: 100,
      render: (m) => <span className="cell-muted">{formatHeartbeat(m.last_heartbeat_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 48,
      render: () => (
        <button type="button" className="btn-icon" onClick={(e) => e.stopPropagation()}>
          <MoreVertical size={14} />
        </button>
      ),
    },
  ];

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

        <DataTable
          title={t('control.machines.title')}
          totalCount={machines.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(m) => String(m.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('control.machines.searchPlaceholder')}
          filterGroups={[
            {
              key: 'online',
              label: t('common.status'),
              options: [
                { value: 'online', label: t('common.online') },
                { value: 'offline', label: t('common.offline') },
              ],
            },
            ...(tenants.length > 1
              ? [{
                  key: 'tenant',
                  label: t('table.tenant'),
                  options: tenants.map((ten) => ({ value: ten.id, label: ten.name })),
                }]
              : []),
          ]}
          filterState={filterState}
          onFilterChange={setFilterState}
          emptyMessage={loading ? t('common.loading') : machines.length === 0 ? t('common.noData') : t('common.noMatch')}
        />
      </div>
    </div>
  );
}
