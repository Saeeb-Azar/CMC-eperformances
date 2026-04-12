import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import { Server, Search, Wifi, WifiOff, MoreVertical } from 'lucide-react';

const demoMachines = [
  { id: '1', machine_id: '0001', name: 'CW-001 Main Hall', model: 'CW1000', tenant: 'Müller Versand GmbH', status: 'RUNNING', is_online: true, tcp_host: '192.168.178.41', tcp_port: 15001, uptime_24h: 98.7, ordersToday: 312, lastHeartbeat: '2s ago' },
  { id: '2', machine_id: '0002', name: 'CW-002 Warehouse B', model: 'CW1000', tenant: 'Müller Versand GmbH', status: 'RUNNING', is_online: true, tcp_host: '192.168.178.42', tcp_port: 15001, uptime_24h: 95.2, ordersToday: 175, lastHeartbeat: '4s ago' },
  { id: '3', machine_id: '0003', name: 'CW-003 Overflow', model: 'CW XL', tenant: 'Müller Versand GmbH', status: 'STOP', is_online: false, tcp_host: '192.168.178.43', tcp_port: 15001, uptime_24h: 0, ordersToday: 0, lastHeartbeat: '3h ago' },
  { id: '4', machine_id: '0004', name: 'CW-004 Pack Center', model: 'CW1000', tenant: 'PackShip Solutions', status: 'RUNNING', is_online: true, tcp_host: '10.0.1.10', tcp_port: 15001, uptime_24h: 99.1, ordersToday: 145, lastHeartbeat: '1s ago' },
  { id: '5', machine_id: '0005', name: 'CW-005 Line A', model: 'CW1000', tenant: 'PackShip Solutions', status: 'PAUSE', is_online: true, tcp_host: '10.0.1.11', tcp_port: 15001, uptime_24h: 72.3, ordersToday: 68, lastHeartbeat: '3s ago' },
  { id: '6', machine_id: '0006', name: 'CW-006 Starter Unit', model: 'CW1000', tenant: 'QuickBox DE', status: 'RUNNING', is_online: true, tcp_host: '172.16.0.5', tcp_port: 15001, uptime_24h: 91.8, ordersToday: 64, lastHeartbeat: '2s ago' },
];

export default function ControlMachinesPage() {
  return (
    <div>
      <Topbar title="Machines" subtitle="Control Panel" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">All Machines</h1>
            <p className="page-header__desc">All machines across all tenants</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid-4 gap-4">
          {[
            { label: 'Total Machines', value: demoMachines.length },
            { label: 'Online', value: demoMachines.filter(m => m.is_online).length },
            { label: 'Offline', value: demoMachines.filter(m => !m.is_online).length },
            { label: 'Orders Today', value: demoMachines.reduce((s, m) => s + m.ordersToday, 0) },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
          <input type="text" placeholder="Search machines..." className="input input--with-icon" />
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Machine</th>
                <th style={{ width: 170 }}>Tenant</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 80 }}>Uptime</th>
                <th style={{ width: 100 }}>Orders Today</th>
                <th style={{ width: 90 }}>Heartbeat</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {demoMachines.map(m => (
                <tr key={m.id}>
                  <td>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${m.is_online ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <Server size={16} className={m.is_online ? 'text-emerald-600' : 'text-gray-400'} />
                    </div>
                  </td>
                  <td>
                    <span className="cell-primary block">{m.name}</span>
                    <span className="cell-muted block mt-0.5">{m.model} · ID: {m.machine_id} · {m.tcp_host}:{m.tcp_port}</span>
                  </td>
                  <td>{m.tenant}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {m.is_online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-gray-400" />}
                      <StatusBadge status={m.status} />
                    </div>
                  </td>
                  <td><span className="cell-primary tabular-nums">{m.uptime_24h}%</span></td>
                  <td><span className="cell-primary tabular-nums">{m.ordersToday.toLocaleString()}</span></td>
                  <td><span className="cell-muted">{m.lastHeartbeat}</span></td>
                  <td><button className="btn-icon"><MoreVertical size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
