import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatusBadge from '../components/ui/StatusBadge';
import { Server, Wifi, WifiOff, Tag, FileText, Ruler } from 'lucide-react';

const demoMachines = [
  { id: '1', machine_id: '0001', name: 'CW-001 Main Hall', model: 'CW1000', status: 'RUNNING', is_online: true, tcp_host: '192.168.178.41', tcp_port: 15001, lab1_enabled: true, lab2_enabled: false, inv_enabled: true, enq_sequence: 4872, uptime_24h: 98.7, last_heartbeat: '2 sec ago', max_length_mm: 6000, max_width_mm: 4000, max_height_mm: 3000 },
  { id: '2', machine_id: '0002', name: 'CW-002 Warehouse B', model: 'CW1000', status: 'RUNNING', is_online: true, tcp_host: '192.168.178.42', tcp_port: 15001, lab1_enabled: true, lab2_enabled: true, inv_enabled: false, enq_sequence: 3291, uptime_24h: 95.2, last_heartbeat: '4 sec ago', max_length_mm: 6000, max_width_mm: 4000, max_height_mm: 3000 },
  { id: '3', machine_id: '0003', name: 'CW-003 Overflow', model: 'CW XL', status: 'STOP', is_online: false, tcp_host: '192.168.178.43', tcp_port: 15001, lab1_enabled: true, lab2_enabled: false, inv_enabled: false, enq_sequence: 891, uptime_24h: 0, last_heartbeat: '3h ago', max_length_mm: 8000, max_width_mm: 5000, max_height_mm: 4000 },
];

export default function MachinesPage() {
  const { t } = useTranslation();

  return (
    <div>
      <Topbar title={t('machines.title')} subtitle={t('machines.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('machines.pageTitle')}</h1>
            <p className="page-header__desc">{t('machines.pageDesc')}</p>
          </div>
          <button className="btn btn--primary btn--lg">{t('machines.addMachine')}</button>
        </div>

        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t('machines.machine')}</th>
                <th style={{ width: 100 }}>{t('common.status')}</th>
                <th style={{ width: 90 }}>{t('common.uptime')}</th>
                <th style={{ width: 90 }}>{t('machines.sequence')}</th>
                <th style={{ width: 100 }}>{t('common.heartbeat')}</th>
                <th style={{ width: 160 }}>{t('machines.maxDimensions')}</th>
                <th style={{ width: 130 }}>{t('machines.stations')}</th>
              </tr>
            </thead>
            <tbody>
              {demoMachines.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${m.is_online ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <Server size={16} className={m.is_online ? 'text-emerald-600' : 'text-gray-400'} />
                    </div>
                  </td>
                  <td>
                    <div>
                      <span className="cell-primary block">{m.name}</span>
                      <span className="cell-muted block mt-0.5">{m.model} · ID: {m.machine_id} · {m.tcp_host}:{m.tcp_port}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {m.is_online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-gray-400" />}
                      <StatusBadge status={m.status} />
                    </div>
                  </td>
                  <td>
                    <span className="cell-primary tabular-nums">{m.uptime_24h}%</span>
                  </td>
                  <td>
                    <span className="cell-mono tabular-nums">{m.enq_sequence.toLocaleString()}</span>
                  </td>
                  <td>
                    <span className="cell-muted">{m.last_heartbeat}</span>
                  </td>
                  <td>
                    <span className="cell-muted flex items-center gap-1">
                      <Ruler size={12} className="text-gray-400" />
                      {m.max_length_mm / 10}×{m.max_width_mm / 10}×{m.max_height_mm / 10} cm
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`flex items-center gap-0.5 ${m.lab1_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={10} /> LAB1</span>
                      <span className={`flex items-center gap-0.5 ${m.lab2_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><Tag size={10} /> LAB2</span>
                      <span className={`flex items-center gap-0.5 ${m.inv_enabled ? 'text-emerald-600' : 'text-gray-300'}`}><FileText size={10} /> INV</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
