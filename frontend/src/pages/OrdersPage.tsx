import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import { Search } from 'lucide-react';

const stateFilters = ['ALL', 'ASSIGNED', 'INDUCTED', 'SCANNED', 'LABELED', 'COMPLETED', 'FAILED', 'EJECTED', 'DELETED'];

const demoOrders = [
  { id: '1', reference_id: 'ref-0487', barcode: '4062196101493', state: 'COMPLETED', tracking_number: 'DHL-00487234', carrier: 'DHL', final_weight_g: 1250, created_at: '2026-04-11T14:32:00Z' },
  { id: '2', reference_id: 'ref-0486', barcode: 'M319991', state: 'COMPLETED', tracking_number: 'DPD-99182734', carrier: 'DPD', final_weight_g: 890, created_at: '2026-04-11T14:31:00Z' },
  { id: '3', reference_id: 'ref-0485', barcode: '4052400033054', state: 'LABELED', tracking_number: 'DHL-00485122', carrier: 'DHL', final_weight_g: null, created_at: '2026-04-11T14:30:00Z' },
  { id: '4', reference_id: 'ref-0484', barcode: '8711319002345', state: 'EJECTED', tracking_number: null, carrier: null, final_weight_g: null, created_at: '2026-04-11T14:29:00Z' },
  { id: '5', reference_id: 'ref-0483', barcode: '4062196101493', state: 'SCANNED', tracking_number: null, carrier: null, final_weight_g: null, created_at: '2026-04-11T14:28:00Z' },
  { id: '6', reference_id: 'ref-0482', barcode: 'M320001', state: 'FAILED', tracking_number: 'DHL-00482901', carrier: 'DHL', final_weight_g: 2100, created_at: '2026-04-11T14:25:00Z' },
  { id: '7', reference_id: 'ref-0481', barcode: '4052400033054', state: 'COMPLETED', tracking_number: 'FDX-817263', carrier: 'FedEx', final_weight_g: 1800, created_at: '2026-04-11T14:22:00Z' },
  { id: '8', reference_id: 'ref-0480', barcode: '4062196101493', state: 'COMPLETED', tracking_number: 'DHL-00480555', carrier: 'DHL', final_weight_g: 950, created_at: '2026-04-11T14:20:00Z' },
];

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function OrdersPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filtered = demoOrders.filter((o) => {
    if (activeFilter !== 'ALL' && o.state !== activeFilter) return false;
    if (search && !o.reference_id.includes(search) && !o.barcode.includes(search) && !(o.tracking_number || '').includes(search)) return false;
    return true;
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
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('orders.noMatch')}</td></tr>
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
