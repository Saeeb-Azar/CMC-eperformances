import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Server,
  Wifi,
  WifiOff,
  Settings,
  Ruler,
  Tag,
  FileText,
} from 'lucide-react';

const demoMachines = [
  {
    id: '1',
    machine_id: '0001',
    name: 'CW-001 Main Hall',
    model: 'CW1000',
    status: 'RUNNING',
    is_online: true,
    tcp_host: '192.168.178.41',
    tcp_port: 15001,
    lab1_enabled: true,
    lab2_enabled: false,
    inv_enabled: true,
    enq_sequence: 4872,
    uptime_24h: 98.7,
    last_heartbeat: '2 sec ago',
    max_length_mm: 6000,
    max_width_mm: 4000,
    max_height_mm: 3000,
  },
  {
    id: '2',
    machine_id: '0002',
    name: 'CW-002 Warehouse B',
    model: 'CW1000',
    status: 'RUNNING',
    is_online: true,
    tcp_host: '192.168.178.42',
    tcp_port: 15001,
    lab1_enabled: true,
    lab2_enabled: true,
    inv_enabled: false,
    enq_sequence: 3291,
    uptime_24h: 95.2,
    last_heartbeat: '4 sec ago',
    max_length_mm: 6000,
    max_width_mm: 4000,
    max_height_mm: 3000,
  },
  {
    id: '3',
    machine_id: '0003',
    name: 'CW-003 Overflow',
    model: 'CW XL',
    status: 'STOP',
    is_online: false,
    tcp_host: '192.168.178.43',
    tcp_port: 15001,
    lab1_enabled: true,
    lab2_enabled: false,
    inv_enabled: false,
    enq_sequence: 891,
    uptime_24h: 0,
    last_heartbeat: '3h ago',
    max_length_mm: 8000,
    max_width_mm: 5000,
    max_height_mm: 4000,
  },
];

export default function MachinesPage() {
  return (
    <div>
      <Topbar title="Machines" subtitle="Manage and monitor your CMC CartonWrap machines" />

      <div className="page-content stack-5">
        {demoMachines.map((m) => (
          <div key={m.id} className="bg-surface rounded-xl border border-border overflow-hidden">
            {/* Machine header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-lg ${m.is_online ? 'bg-green-50' : 'bg-gray-100'}`}>
                  <Server size={20} className={m.is_online ? 'text-accent' : 'text-text-muted'} />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary">{m.name}</h3>
                  <p className="text-xs text-text-muted">
                    {m.model} &middot; ID: {m.machine_id} &middot; {m.tcp_host}:{m.tcp_port}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {m.is_online ? (
                  <Wifi size={16} className="text-accent" />
                ) : (
                  <WifiOff size={16} className="text-text-muted" />
                )}
                <StatusBadge status={m.status} />
                <button className="p-2 rounded-lg hover:bg-surface-tertiary transition-colors">
                  <Settings size={16} className="text-text-secondary" />
                </button>
              </div>
            </div>

            {/* Machine details */}
            <div className="px-6 py-4 grid grid-cols-6 gap-6 text-sm">
              <div>
                <p className="text-xs text-text-muted mb-1">Uptime (24h)</p>
                <p className="font-semibold text-text-primary">{m.uptime_24h}%</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">ENQ Sequence</p>
                <p className="font-semibold text-text-primary font-mono">{m.enq_sequence.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Last Heartbeat</p>
                <p className="font-semibold text-text-primary">{m.last_heartbeat}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Max Dimensions</p>
                <p className="text-text-primary flex items-center gap-1">
                  <Ruler size={12} className="text-text-muted" />
                  {m.max_length_mm / 10}x{m.max_width_mm / 10}x{m.max_height_mm / 10} cm
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Stations</p>
                <div className="flex items-center gap-2">
                  <Tag size={12} className={m.lab1_enabled ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs">LAB1</span>
                  <Tag size={12} className={m.lab2_enabled ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs">LAB2</span>
                  <FileText size={12} className={m.inv_enabled ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs">INV</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
