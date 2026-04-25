import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable, { type Column, type FilterState } from '../components/ui/DataTable';
import { Server, Wifi, WifiOff, Tag, FileText, Ruler, Plus } from 'lucide-react';
import { api, type MachineRead } from '../services/api';
import MachineFormModal from '../components/machines/MachineFormModal';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({ online: [], status: [] });

  const reload = () =>
    api.listMachines()
      .then((m) => { setMachines(m); setLoading(false); })
      .catch(() => { setMachines([]); setLoading(false); });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      reload();
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const statuses = useMemo(() => Array.from(new Set(machines.map((m) => m.status))).sort(), [machines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return machines.filter((m) => {
      if (q) {
        const hay = `${m.name} ${m.model} ${m.machine_id} ${m.tcp_host}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const onlineSel = filterState.online ?? [];
      if (onlineSel.length > 0) {
        const wanted = onlineSel.includes('online');
        const wantedOff = onlineSel.includes('offline');
        if (m.is_online && !wanted) return false;
        if (!m.is_online && !wantedOff) return false;
      }
      const statusSel = filterState.status ?? [];
      if (statusSel.length > 0 && !statusSel.includes(m.status)) return false;
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
      width: 110,
      render: (m) => <span className="cell-muted">{formatHeartbeat(m.last_heartbeat_at)}</span>,
    },
    {
      key: 'dimensions',
      header: t('machines.maxDimensions'),
      width: 170,
      render: (m) => (
        <span className="cell-muted flex items-center gap-1">
          <Ruler size={12} className="text-gray-400" />
          {m.max_length_mm / 10}×{m.max_width_mm / 10}×{m.max_height_mm / 10} cm
        </span>
      ),
    },
    {
      key: 'stations',
      header: t('machines.stations'),
      width: 140,
      render: (m) => (
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-0.5 ${m.lab1_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={10} /> LAB1</span>
          <span className={`flex items-center gap-0.5 ${m.lab2_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={10} /> LAB2</span>
          <span className={`flex items-center gap-0.5 ${m.inv_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><FileText size={10} /> INV</span>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Topbar title={t('machines.title')} subtitle={t('machines.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('machines.pageTitle')}</h1>
            <p className="page-header__desc">{t('machines.pageDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn btn--primary btn--lg"
          >
            <Plus size={16} /> {t('machines.addMachine')}
          </button>
        </div>

        <MachineFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={(m) => {
            setMachines((prev) => [m, ...prev]);
            reload();
          }}
        />

        <DataTable
          title={t('machines.title')}
          totalCount={machines.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(m) => String(m.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('machines.searchPlaceholder', 'Suche nach Name, Maschinen-ID, Host...')}
          filterGroups={[
            {
              key: 'online',
              label: t('common.status'),
              options: [
                { value: 'online', label: t('common.online') },
                { value: 'offline', label: t('common.offline') },
              ],
            },
            ...(statuses.length > 1
              ? [{
                  key: 'status',
                  label: t('common.status'),
                  options: statuses.map((s) => ({ value: s, label: t(`status.${s}`, s) })),
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
