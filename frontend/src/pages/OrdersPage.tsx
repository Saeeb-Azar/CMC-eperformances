import { useState } from 'react';
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
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filtered = demoOrders.filter((o) => {
    if (activeFilter !== 'ALL' && o.state !== activeFilter) return false;
    if (search && !o.reference_id.includes(search) && !o.barcode.includes(search) && !(o.tracking_number || '').includes(search)) return false;
    return true;
  });

  return (
    <div>
      <Topbar title="Packages" subtitle="Track all packages" />

      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Packages</h1>
            <p className="page-header__desc">Track all packages through the machine</p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col gap-4">
          <div className="relative" style={{ maxWidth: 420 }}>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by reference, barcode, or tracking..."
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
                <th>Reference</th>
                <th>Barcode</th>
                <th>State</th>
                <th>Carrier</th>
                <th>Tracking</th>
                <th>Weight</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No packages match your filters</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id}>
                    <td><span className="font-mono font-semibold text-gray-900">{o.reference_id}</span></td>
                    <td><span className="font-mono text-gray-500 text-xs">{o.barcode}</span></td>
                    <td><StatusBadge status={o.state} /></td>
                    <td className="text-gray-600">{o.carrier || <span className="text-gray-300">—</span>}</td>
                    <td>{o.tracking_number ? <span className="font-mono text-xs text-gray-500">{o.tracking_number}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="tabular-nums">{o.final_weight_g ? `${(o.final_weight_g / 1000).toFixed(2)} kg` : <span className="text-gray-300">—</span>}</td>
                    <td className="text-gray-400 tabular-nums text-xs">{formatTime(o.created_at)}</td>
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
