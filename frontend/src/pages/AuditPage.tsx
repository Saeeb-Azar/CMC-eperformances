import { useState } from 'react';
import Topbar from '../components/layout/Topbar';
import { Search } from 'lucide-react';

const categories = ['ALL', 'machine_event', 'state_transition', 'user_action', 'error'];

const demoLogs = [
  { id: '1', event_type: 'ENQ', category: 'machine_event', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: 'ASSIGNED', detail: 'Barcode 4062196101493 accepted', timestamp: '2026-04-11T14:32:01Z' },
  { id: '2', event_type: 'state_transition', category: 'state_transition', machine_id: '0001', reference_id: 'ref-0487', previous_state: 'ASSIGNED', new_state: 'INDUCTED', detail: 'IND received', timestamp: '2026-04-11T14:32:04Z' },
  { id: '3', event_type: 'ACK', category: 'machine_event', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: null, detail: 'Dimensions: 350x200x150mm, PROCESSABLE', timestamp: '2026-04-11T14:32:12Z' },
  { id: '4', event_type: 'LAB1', category: 'machine_event', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: null, detail: 'Label generated via DHL API (1.2s)', timestamp: '2026-04-11T14:32:30Z' },
  { id: '5', event_type: 'state_transition', category: 'state_transition', machine_id: '0001', reference_id: 'ref-0487', previous_state: 'SCANNED', new_state: 'LABELED', detail: 'Label applied, tracking DHL-00487234', timestamp: '2026-04-11T14:32:31Z' },
  { id: '6', event_type: 'END', category: 'machine_event', machine_id: '0001', reference_id: 'ref-0487', previous_state: null, new_state: null, detail: 'Exit verification PASSED', timestamp: '2026-04-11T14:32:38Z' },
  { id: '7', event_type: 'state_transition', category: 'state_transition', machine_id: '0001', reference_id: 'ref-0487', previous_state: 'LABELED', new_state: 'COMPLETED', detail: 'Pulpo completion OK', timestamp: '2026-04-11T14:32:39Z' },
  { id: '8', event_type: 'resolve', category: 'user_action', machine_id: null, reference_id: 'ref-0482', previous_state: 'FAILED', new_state: 'COMPLETED', detail: 'Manually resolved by admin@company.de', timestamp: '2026-04-11T14:35:00Z' },
  { id: '9', event_type: 'HBT', category: 'machine_event', machine_id: '0001', reference_id: null, previous_state: null, new_state: null, detail: 'Heartbeat OK, status RUNNING', timestamp: '2026-04-11T14:35:05Z' },
];

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const categoryBadge: Record<string, string> = {
  machine_event: 'badge badge--info',
  state_transition: 'badge badge--neutral',
  user_action: 'badge badge--success',
  error: 'badge badge--danger',
};

export default function AuditPage() {
  const [activeCat, setActiveCat] = useState('ALL');
  const [search, setSearch] = useState('');

  const filtered = demoLogs.filter((log) => {
    if (activeCat !== 'ALL' && log.category !== activeCat) return false;
    if (search && !log.detail?.toLowerCase().includes(search.toLowerCase()) && !log.reference_id?.includes(search) && !log.event_type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <Topbar title="Logs" subtitle="Event traceability" />

      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Audit Log</h1>
            <p className="page-header__desc">Complete event traceability for all machines</p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-4">
          <div className="relative" style={{ maxWidth: 420 }}>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search events, references..." value={search} onChange={(e) => setSearch(e.target.value)} className="input input--with-icon" />
          </div>
          <div className="filter-tabs">
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCat(c)} className={`filter-tab ${activeCat === c ? 'filter-tab--active' : ''}`}>
                {c === 'ALL' ? 'All' : c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Time</th>
                <th>Category</th>
                <th>Event</th>
                <th>Machine</th>
                <th>Reference</th>
                <th>Transition</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No logs match your filters</td></tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id}>
                    <td><span className="font-mono text-xs text-gray-400 tabular-nums">{formatTime(log.timestamp)}</span></td>
                    <td><span className={categoryBadge[log.category] || 'badge badge--neutral'}>{log.category.replace(/_/g, ' ')}</span></td>
                    <td><span className="font-mono text-xs font-semibold text-gray-900">{log.event_type}</span></td>
                    <td>{log.machine_id ? <span className="font-mono text-xs text-gray-500">{log.machine_id}</span> : <span className="text-gray-300">—</span>}</td>
                    <td>{log.reference_id ? <span className="font-mono text-xs text-gray-500">{log.reference_id}</span> : <span className="text-gray-300">—</span>}</td>
                    <td>
                      {log.previous_state && log.new_state ? (
                        <span className="text-xs"><span className="text-gray-400">{log.previous_state}</span> <span className="text-gray-300">→</span> <span className="font-medium text-gray-700">{log.new_state}</span></span>
                      ) : log.new_state ? (
                        <span className="text-xs font-medium text-gray-700">{log.new_state}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-gray-500 text-xs">{log.detail}</td>
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
