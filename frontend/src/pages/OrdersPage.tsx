import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable, { type Column, type FilterState } from '../components/ui/DataTable';
import { api, type OrderStateListItem } from '../services/api';

const STATE_OPTIONS = ['ASSIGNED', 'INDUCTED', 'SCANNED', 'LABELED', 'COMPLETED', 'FAILED', 'EJECTED', 'DELETED'];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function OrdersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<OrderStateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<FilterState>({ state: [], carrier: [] });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.listOrders({ limit: '200' })
        .then((o) => { if (!cancelled) { setOrders(o); setLoading(false); } })
        .catch(() => { if (!cancelled) { setOrders([]); setLoading(false); } });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const carriers = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.carrier) set.add(o.carrier);
    return Array.from(set).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (q) {
        const hay = `${o.reference_id} ${o.barcode} ${o.tracking_number ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const states = filterState.state ?? [];
      if (states.length > 0 && !states.includes(o.state)) return false;
      const carrierFilter = filterState.carrier ?? [];
      if (carrierFilter.length > 0 && !carrierFilter.includes(o.carrier ?? '')) return false;
      return true;
    });
  }, [orders, search, filterState]);

  const columns: Column<OrderStateListItem>[] = [
    {
      key: 'reference',
      header: t('orders.reference'),
      render: (o) => <span className="cell-mono cell-primary">{o.reference_id}</span>,
    },
    {
      key: 'barcode',
      header: t('orders.barcode'),
      render: (o) => <span className="cell-mono">{o.barcode}</span>,
    },
    {
      key: 'state',
      header: t('orders.state'),
      render: (o) => <StatusBadge status={o.state} />,
    },
    {
      key: 'carrier',
      header: t('orders.carrier'),
      render: (o) => o.carrier || <span className="cell-empty">—</span>,
    },
    {
      key: 'tracking',
      header: t('orders.tracking'),
      render: (o) =>
        o.tracking_number ? <span className="cell-mono">{o.tracking_number}</span> : <span className="cell-empty">—</span>,
    },
    {
      key: 'weight',
      header: t('orders.weight'),
      align: 'right',
      render: (o) =>
        o.final_weight_g ? (
          <span className="tabular-nums">{(o.final_weight_g / 1000).toFixed(2)} kg</span>
        ) : (
          <span className="cell-empty">—</span>
        ),
    },
    {
      key: 'time',
      header: t('orders.time'),
      align: 'right',
      render: (o) => <span className="cell-muted tabular-nums">{formatTime(o.created_at)}</span>,
    },
  ];

  return (
    <div>
      <Topbar title={t('orders.title')} subtitle={t('orders.subtitle')} />

      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('orders.pageTitle')}</h1>
            <p className="page-header__desc">{t('orders.pageDesc')}</p>
          </div>
        </div>

        <DataTable
          title={t('orders.title')}
          totalCount={orders.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(o) => String(o.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('orders.searchPlaceholder')}
          filterGroups={[
            {
              key: 'state',
              label: t('orders.state'),
              options: STATE_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`, s) })),
            },
            ...(carriers.length > 0
              ? [{ key: 'carrier', label: t('orders.carrier'), options: carriers.map((c) => ({ value: c })) }]
              : []),
          ]}
          filterState={filterState}
          onFilterChange={setFilterState}
          emptyMessage={loading ? t('common.loading') : (orders.length === 0 ? t('common.noData') : t('common.noMatch'))}
        />
      </div>
    </div>
  );
}
