import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import { Server, Wifi, WifiOff, Settings, Ruler, Tag, FileText } from 'lucide-react';

const demoMachines = [
  { id: '1', machine_id: '0001', name: 'CW-001 Main Hall', model: 'CW1000', status: 'RUNNING', is_online: true, tcp_host: '192.168.178.41', tcp_port: 15001, lab1_enabled: true, lab2_enabled: false, inv_enabled: true, enq_sequence: 4872, uptime_24h: 98.7, last_heartbeat: '2 sec ago', max_length_mm: 6000, max_width_mm: 4000, max_height_mm: 3000 },
  { id: '2', machine_id: '0002', name: 'CW-002 Warehouse B', model: 'CW1000', status: 'RUNNING', is_online: true, tcp_host: '192.168.178.42', tcp_port: 15001, lab1_enabled: true, lab2_enabled: true, inv_enabled: false, enq_sequence: 3291, uptime_24h: 95.2, last_heartbeat: '4 sec ago', max_length_mm: 6000, max_width_mm: 4000, max_height_mm: 3000 },
  { id: '3', machine_id: '0003', name: 'CW-003 Overflow', model: 'CW XL', status: 'STOP', is_online: false, tcp_host: '192.168.178.43', tcp_port: 15001, lab1_enabled: true, lab2_enabled: false, inv_enabled: false, enq_sequence: 891, uptime_24h: 0, last_heartbeat: '3h ago', max_length_mm: 8000, max_width_mm: 5000, max_height_mm: 4000 },
];

export default function MachinesPage() {
  return (
    <div>
      <Topbar title="Machines" subtitle="Configuration" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Machines</h1>
            <p className="page-header__desc">Manage and monitor your CMC CartonWrap machines</p>
          </div>
          <button className="btn btn--primary btn--lg">Add Machine</button>
        </div>

        <div className="stack-4">
          {demoMachines.map((m) => (
            <div key={m.id} className="panel">
              {/* Header */}
              <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${m.is_online ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                    <Server size={18} className={m.is_online ? 'text-emerald-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{m.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{m.model} · ID: {m.machine_id} · {m.tcp_host}:{m.tcp_port}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {m.is_online ? <Wifi size={16} className="text-emerald-500" /> : <WifiOff size={16} className="text-gray-400" />}
                  <StatusBadge status={m.status} />
                  <button className="btn-icon"><Settings size={16} /></button>
                </div>
              </div>

              {/* Details */}
              <div className="px-6 py-5 grid grid-cols-6 gap-6">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Uptime (24h)</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{m.uptime_24h}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">ENQ Sequence</p>
                  <p className="text-base font-semibold text-gray-900 font-mono tabular-nums">{m.enq_sequence.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Last Heartbeat</p>
                  <p className="text-base font-medium text-gray-700">{m.last_heartbeat}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Max Dimensions</p>
                  <p className="text-sm text-gray-700 flex items-center gap-1"><Ruler size={12} className="text-gray-400" />{m.max_length_mm / 10}×{m.max_width_mm / 10}×{m.max_height_mm / 10} cm</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Stations</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`flex items-center gap-1 ${m.lab1_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={11} /> LAB1</span>
                    <span className={`flex items-center gap-1 ${m.lab2_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={11} /> LAB2</span>
                    <span className={`flex items-center gap-1 ${m.inv_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><FileText size={11} /> INV</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
