import { useState } from 'react';
import Header from '../components/layout/Header';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Search, Filter } from 'lucide-react';

const stateFilters = ['ALL', 'ASSIGNED', 'INDUCTED', 'SCANNED', 'LABELED', 'COMPLETED', 'FAILED', 'EJECTED', 'DELETED'];

const demoOrders = [
  { id: '1', reference_id: 'ref-0487', barcode: '4062196101493', state: 'COMPLETED', tracking_number: 'DHL-00487234', carrier: 'DHL', final_weight_g: 1250, created_at: '2026-04-11T14:32:00Z' },
  { id: '2', reference_id: 'ref-0486', barcode: 'M319991', state: 'COMPLETED', tracking_number: 'DPD-99182734', carrier: 'DPD', final_weight_g: 890, created_at: '2026-04-11T14:31:00Z' },
  { id: '3', reference_id: 'ref-0485', barcode: '4052400033054', state: 'LABELED', tracking_number: 'DHL-00485122', carrier: 'DHL', final_weight_g: null, created_at: '2026-04-11T14:30:00Z' },
  { id: '4', reference_id: 'ref-0484', barcode: '8711319002345', state: 'EJECTED', tracking_number: null, carrier: null, final_weight_g: null, created_at: '2026-04-11T14:29:00Z', ejection_reason: 'too_large' },
  { id: '5', reference_id: 'ref-0483', barcode: '4062196101493', state: 'SCANNED', tracking_number: null, carrier: null, final_weight_g: null, created_at: '2026-04-11T14:28:00Z' },
  { id: '6', reference_id: 'ref-0482', barcode: 'M320001', state: 'FAILED', tracking_number: 'DHL-00482901', carrier: 'DHL', final_weight_g: 2100, created_at: '2026-04-11T14:25:00Z' },
  { id: '7', reference_id: 'ref-0481', barcode: '4052400033054', state: 'COMPLETED', tracking_number: 'FDX-817263', carrier: 'FedEx', final_weight_g: 1800, created_at: '2026-04-11T14:22:00Z' },
  { id: '8', reference_id: 'ref-0480', barcode: '4062196101493', state: 'COMPLETED', tracking_number: 'DHL-00480555', carrier: 'DHL', final_weight_g: 950, created_at: '2026-04-11T14:20:00Z' },
];

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const columns = [
  {
    key: 'reference_id',
    header: 'Reference',
    render: (row: Record<string, unknown>) => (
      <span className="font-mono text-text-primary font-medium">{row.reference_id as string}</span>
    ),
  },
  { key: 'barcode', header: 'Barcode', render: (row: Record<string, unknown>) => <span className="font-mono text-xs">{row.barcode as string}</span> },
  {
    key: 'state',
    header: 'State',
    render: (row: Record<string, unknown>) => <StatusBadge status={row.state as string} />,
  },
  { key: 'carrier', header: 'Carrier' },
  {
    key: 'tracking_number',
    header: 'Tracking',
    render: (row: Record<string, unknown>) =>
      row.tracking_number ? <span className="font-mono text-xs">{row.tracking_number as string}</span> : <span className="text-text-muted">-</span>,
  },
  {
    key: 'final_weight_g',
    header: 'Weight',
    render: (row: Record<string, unknown>) =>
      row.final_weight_g ? `${((row.final_weight_g as number) / 1000).toFixed(2)} kg` : '-',
  },
  {
    key: 'created_at',
    header: 'Time',
    render: (row: Record<string, unknown>) => formatTime(row.created_at as string),
  },
];

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
      <Header title="Orders" subtitle="Track all packages through the machine" />

      <div className="p-8 space-y-4">
        {/* Search + Filter bar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search by reference, barcode, or tracking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-sidebar focus:ring-1 focus:ring-sidebar"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-text-muted mr-1" />
            {stateFilters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeFilter === f
                    ? 'bg-sidebar text-white'
                    : 'text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          keyField="id"
          emptyMessage="No orders match your filters"
        />
      </div>
    </div>
  );
}
