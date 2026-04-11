import { useState } from 'react';
import Header from '../components/layout/Header';
import DataTable from '../components/ui/DataTable';
import { Search, Filter } from 'lucide-react';

const categories = ['ALL', 'machine_event', 'state_transition', 'user_action', 'error'];

const demoLogs = [
  { id: '1', event_type: 'ENQ', category: 'machine_event', actor_type: 'machine', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: 'ASSIGNED', detail: 'Barcode 4062196101493 accepted', timestamp: '2026-04-11T14:32:01Z' },
  { id: '2', event_type: 'state_transition', category: 'state_transition', actor_type: 'system', machine_id: '0001', reference_id: 'ref-0487', previous_state: 'ASSIGNED', new_state: 'INDUCTED', detail: 'IND received', timestamp: '2026-04-11T14:32:04Z' },
  { id: '3', event_type: 'ACK', category: 'machine_event', actor_type: 'machine', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: null, detail: 'Dimensions: 350x200x150mm, PROCESSABLE', timestamp: '2026-04-11T14:32:12Z' },
  { id: '4', event_type: 'LAB1', category: 'machine_event', actor_type: 'machine', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: null, detail: 'Label generated via DHL API (1.2s)', timestamp: '2026-04-11T14:32:30Z' },
  { id: '5', event_type: 'state_transition', category: 'state_transition', actor_type: 'system', machine_id: '0001', reference_id: 'ref-0487', previous_state: 'SCANNED', new_state: 'LABELED', detail: 'Label applied, tracking DHL-00487234', timestamp: '2026-04-11T14:32:31Z' },
  { id: '6', event_type: 'END', category: 'machine_event', actor_type: 'machine', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: null, detail: 'Exit verification PASSED', timestamp: '2026-04-11T14:32:38Z' },
  { id: '7', event_type: 'state_transition', category: 'state_transition', actor_type: 'system', machine_id: '0001', reference_id: 'ref-0487', previous_state: 'LABELED', new_state: 'COMPLETED', detail: 'Pulpo completion OK', timestamp: '2026-04-11T14:32:39Z' },
  { id: '8', event_type: 'resolve', category: 'user_action', actor_type: 'user', machine_id: null, reference_id: 'ref-0482', previous_state: 'FAILED', new_state: 'COMPLETED', detail: 'Manually resolved by admin@company.de', timestamp: '2026-04-11T14:35:00Z' },
  { id: '9', event_type: 'HBT', category: 'machine_event', actor_type: 'machine', machine_id: '0001', reference_id: null, previous_state: null, new_state: null, detail: 'Heartbeat OK, status RUNNING', timestamp: '2026-04-11T14:35:05Z' },
];

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const categoryColors: Record<string, string> = {
  machine_event: 'bg-blue-50 text-blue-700',
  state_transition: 'bg-purple-50 text-purple-700',
  user_action: 'bg-green-50 text-green-700',
  error: 'bg-red-50 text-red-700',
};

const columns = [
  {
    key: 'timestamp',
    header: 'Time',
    render: (row: Record<string, unknown>) => (
      <span className="text-xs font-mono text-text-secondary">{formatTime(row.timestamp as string)}</span>
    ),
    className: 'w-20',
  },
  {
    key: 'category',
    header: 'Category',
    render: (row: Record<string, unknown>) => (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${categoryColors[row.category as string] || 'bg-gray-50 text-gray-600'}`}>
        {(row.category as string).replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    key: 'event_type',
    header: 'Event',
    render: (row: Record<string, unknown>) => (
      <span className="font-mono text-xs font-medium text-text-primary">{row.event_type as string}</span>
    ),
  },
  { key: 'machine_id', header: 'Machine', render: (row: Record<string, unknown>) => row.machine_id ? <span className="font-mono text-xs">{row.machine_id as string}</span> : <span className="text-text-muted">-</span> },
  { key: 'reference_id', header: 'Reference', render: (row: Record<string, unknown>) => row.reference_id ? <span className="font-mono text-xs">{row.reference_id as string}</span> : <span className="text-text-muted">-</span> },
  {
    key: 'transition',
    header: 'Transition',
    render: (row: Record<string, unknown>) =>
      row.previous_state && row.new_state ? (
        <span className="text-xs">
          <span className="text-text-muted">{row.previous_state as string}</span>
          <span className="text-text-muted mx-1">&rarr;</span>
          <span className="font-medium text-text-primary">{row.new_state as string}</span>
        </span>
      ) : row.new_state ? (
        <span className="text-xs font-medium text-text-primary">{row.new_state as string}</span>
      ) : (
        <span className="text-text-muted">-</span>
      ),
  },
  { key: 'detail', header: 'Detail', render: (row: Record<string, unknown>) => <span className="text-xs text-text-secondary">{row.detail as string}</span> },
];

export default function AuditPage() {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [search, setSearch] = useState('');

  const filtered = demoLogs.filter((log) => {
    if (activeCategory !== 'ALL' && log.category !== activeCategory) return false;
    if (search && !log.detail?.toLowerCase().includes(search.toLowerCase()) && !log.reference_id?.includes(search) && !log.event_type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <Header title="Audit Log" subtitle="Complete event traceability" />

      <div className="p-8 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search events, references..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-sidebar focus:ring-1 focus:ring-sidebar"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-text-muted mr-1" />
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeCategory === c
                    ? 'bg-sidebar text-white'
                    : 'text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {c === 'ALL' ? 'ALL' : c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          keyField="id"
          emptyMessage="No audit logs match your filters"
        />
      </div>
    </div>
  );
}
