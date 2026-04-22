import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import { Search } from 'lucide-react';
import { api, type OrderStateListItem } from '../services/api';

const stateFilters = ['ALL', 'ASSIGNED', 'INDUCTED', 'SCANNED', 'LABELED', 'COMPLETED', 'FAILED', 'EJECTED', 'DELETED'];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function OrdersPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<OrderStateListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const params: Record<string, string> = { limit: '200' };
      if (activeFilter !== 'ALL') params.state = activeFilter;
      api.listOrders(params)
        .then((o) => { if (!cancelled) { setOrders(o); setLoading(false); } })
        .catch(() => { if (!cancelled) { setOrders([]); setLoading(false); } });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeFilter]);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.reference_id.toLowerCase().includes(q) ||
      o.barcode.toLowerCase().includes(q) ||
      (o.tracking_number || '').toLowerCase().includes(q)
    );
  });

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

        {/* Search + Filter */}
        <div className="flex flex-col gap-4">
          <div className="relative" style={{ maxWidth: 420 }}>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('orders.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input--with-icon"
            />
          </div>
          <div className="filter-tabs">
            {stateFilters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`filter-tab ${activeFilter === f ? 'filter-tab--active' : ''}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>{t('orders.reference')}</th>
                <th>{t('orders.barcode')}</th>
                <th>{t('orders.state')}</th>
                <th>{t('orders.carrier')}</th>
                <th>{t('orders.tracking')}</th>
                <th>{t('orders.weight')}</th>
                <th>{t('orders.time')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{orders.length === 0 ? t('common.noData') : t('orders.noMatch')}</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id}>
                    <td className="cell-primary"><span className="font-mono">{o.reference_id}</span></td>
                    <td className="cell-mono">{o.barcode}</td>
                    <td><StatusBadge status={o.state} /></td>
                    <td>{o.carrier || <span className="cell-empty">—</span>}</td>
                    <td>{o.tracking_number ? <span className="cell-mono">{o.tracking_number}</span> : <span className="cell-empty">—</span>}</td>
                    <td className="tabular-nums">{o.final_weight_g ? `${(o.final_weight_g / 1000).toFixed(2)} kg` : <span className="cell-empty">—</span>}</td>
                    <td className="cell-muted tabular-nums">{formatTime(o.created_at)}</td>
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
