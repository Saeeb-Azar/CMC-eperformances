import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable, { type Column, type FilterState } from '../components/ui/DataTable';
import { Server, Wifi, WifiOff, Tag, FileText, Ruler, Plus, Pencil, Boxes, CheckCircle, AlertTriangle } from 'lucide-react';
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
  const [machinesDb, setMachines] = useState<MachineRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MachineRead | null>(null);
  const [prefillId, setPrefillId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({ online: [], status: [] });
  const [connectedIds, setConnectedIds] = useState<string[]>([]);

  const reload = () => {
    api.listMachines()
      .then((m) => { setMachines(m); setLoading(false); })
      .catch(() => { setMachines([]); setLoading(false); });
    api.getGatewayStatus()
      .then((g) => setConnectedIds(g.connected_machines ?? []))
      .catch(() => { /* gateway not reachable */ });
  };

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

  // Overlay the LIVE TCP connection status (in-memory gateway) onto the DB
  // records, so a connected machine shows online even without DB persistence.
  const machines = useMemo(() => machinesDb.map((m) =>
    connectedIds.includes(m.machine_id)
      ? { ...m, is_online: true, status: m.status === 'STOP' || m.status === 'ERROR' ? 'RUNNING' : m.status }
      : m,
  ), [machinesDb, connectedIds]);

  const statuses = useMemo(() => Array.from(new Set(machines.map((m) => m.status))).sort(), [machines]);

  // Verbunden, aber nicht angelegt: die Maschine sendet bereits eine ID, die
  // hier niemand kennt — der häufigste Stolperstein beim Anbinden. Wird als
  // Banner mit Ein-Klick-Anlage angeboten.
  const unknownIds = useMemo(
    () => connectedIds.filter((id) => !machinesDb.some((m) => m.machine_id === id)),
    [connectedIds, machinesDb],
  );

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
    {
      key: 'pulpo',
      header: t('machines.pulpoLocation', 'Pulpo-Location'),
      width: 150,
      render: (m) => (
        m.pulpo_pick_location
          ? <span className="cell-muted flex items-center gap-1"><Boxes size={12} className="text-blue-500" />{m.pulpo_pick_location}</span>
          : <span className="cell-muted text-gray-300">—</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 56,
      render: (m) => (
        <button
          type="button"
          onClick={() => setEditing(m)}
          className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center"
          title={t('common.edit', 'Bearbeiten')}
        >
          <Pencil size={14} />
        </button>
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

        {/* Verbunden, aber noch nicht angelegt → Ein-Klick-Anlage */}
        {unknownIds.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '12px 16px', borderRadius: 12, marginBottom: 20,
            background: '#fffbeb', border: '1px solid #fde68a',
          }}>
            <Wifi size={18} style={{ color: '#d97706', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                Maschine verbunden, aber noch nicht angelegt
              </div>
              <div style={{ fontSize: 12, color: '#a16207' }}>
                Es sendet bereits eine Maschine mit unbekannter ID — übernehmen, um sie anzuzeigen.
              </div>
            </div>
            {unknownIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => { setPrefillId(id); setModalOpen(true); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #d97706', background: '#fff',
                  fontSize: 12.5, fontWeight: 700, color: '#92400e',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <Plus size={13} /> ID {id} anlegen
              </button>
            ))}
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {(() => {
            const online = machines.filter((m) => m.is_online).length;
            const warnings = machines.filter((m) => m.status === 'ERROR').length;
            const cards = [
              { label: 'Maschinen', sub: 'gesamt', value: machines.length, icon: <Boxes size={20} />, c: { bg: '#eff6ff', fg: '#2563eb' } },
              { label: 'Online', sub: 'Maschinen', value: online, icon: <CheckCircle size={20} />, c: { bg: '#ecfdf5', fg: '#059669' } },
              { label: 'Warnungen', sub: 'aktiv', value: warnings, icon: <AlertTriangle size={20} />, c: { bg: '#fffbeb', fg: '#d97706' } },
              { label: 'Verbindungen', sub: 'aktiv', value: online, icon: <Wifi size={20} />, c: { bg: '#f5f3ff', fg: '#7c3aed' } },
            ];
            return cards.map((s) => (
              <div key={s.label} style={{
                background: 'var(--clr-bg-elevated, #fff)', border: '1px solid var(--clr-border)',
                borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <span style={{ width: 46, height: 46, borderRadius: 12, background: s.c.bg, color: s.c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', marginTop: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>{s.sub}</div>
                </div>
              </div>
            ));
          })()}
        </div>

        <MachineFormModal
          open={modalOpen || !!editing}
          machine={editing}
          initialMachineId={prefillId}
          onDeleted={() => { reload(); }}
          onClose={() => { setModalOpen(false); setEditing(null); setPrefillId(null); }}
          onCreated={(m) => {
            setMachines((prev) => {
              const idx = prev.findIndex((x) => x.id === m.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = m; return next; }
              return [m, ...prev];
            });
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
