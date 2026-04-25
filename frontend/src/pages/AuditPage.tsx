import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import DataTable, { type Column, type FilterState } from '../components/ui/DataTable';
import { api, type AuditLogRead } from '../services/api';

const CATEGORIES = ['machine_event', 'state_transition', 'user_action', 'error'];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const categoryBadge: Record<string, string> = {
  machine_event: 'badge badge--info',
  state_transition: 'badge badge--neutral',
  user_action: 'badge badge--success',
  error: 'badge badge--danger',
};

export default function AuditPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<FilterState>({ category: [] });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.auditLogs({ limit: '200' })
        .then((l) => { if (!cancelled) { setLogs(l); setLoading(false); } })
        .catch(() => { if (!cancelled) { setLogs([]); setLoading(false); } });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (q) {
        const hay = `${log.detail ?? ''} ${log.reference_id ?? ''} ${log.event_type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cats = filterState.category ?? [];
      if (cats.length > 0 && !cats.includes(log.category)) return false;
      return true;
    });
  }, [logs, search, filterState]);

  const columns: Column<AuditLogRead>[] = [
    {
      key: 'time',
      header: t('audit.time'),
      width: 100,
      render: (log) => <span className="cell-muted cell-mono tabular-nums">{formatTime(log.timestamp)}</span>,
    },
    {
      key: 'category',
      header: t('audit.category'),
      width: 150,
      render: (log) => (
        <span className={categoryBadge[log.category] || 'badge badge--neutral'}>
          {log.category.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'event',
      header: t('audit.event'),
      render: (log) => <span className="cell-mono cell-primary">{log.event_type}</span>,
    },
    {
      key: 'machine',
      header: t('audit.machineCol'),
      render: (log) => log.machine_id ? <span className="cell-mono">{log.machine_id}</span> : <span className="cell-empty">—</span>,
    },
    {
      key: 'reference',
      header: t('audit.reference'),
      render: (log) => log.reference_id ? <span className="cell-mono">{log.reference_id}</span> : <span className="cell-empty">—</span>,
    },
    {
      key: 'transition',
      header: t('audit.transition'),
      render: (log) =>
        log.previous_state && log.new_state ? (
          <span className="cell-muted">
            {log.previous_state} <span className="cell-empty">→</span> <span className="cell-primary">{log.new_state}</span>
          </span>
        ) : log.new_state ? (
          <span className="cell-primary">{log.new_state}</span>
        ) : (
          <span className="cell-empty">—</span>
        ),
    },
    {
      key: 'detail',
      header: t('audit.detail'),
      render: (log) => <span className="cell-muted">{log.detail}</span>,
    },
  ];

  return (
    <div>
      <Topbar title={t('audit.title')} subtitle={t('audit.subtitle')} />

      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('audit.pageTitle')}</h1>
            <p className="page-header__desc">{t('audit.pageDesc')}</p>
          </div>
        </div>

        <DataTable
          title={t('audit.title')}
          totalCount={logs.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(log) => String(log.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('audit.searchPlaceholder')}
          filterGroups={[
            {
              key: 'category',
              label: t('audit.category'),
              options: CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') })),
            },
          ]}
          filterState={filterState}
          onFilterChange={setFilterState}
          emptyMessage={loading ? t('common.loading') : (logs.length === 0 ? t('common.noData') : t('common.noMatch'))}
        />
      </div>
    </div>
  );
}
