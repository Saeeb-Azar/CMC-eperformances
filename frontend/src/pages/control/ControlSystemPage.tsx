import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import {
  Construction, RefreshCw, Server, Activity,
  AlertTriangle, CheckCircle, Shield,
} from 'lucide-react';
import { api, type GatewayStatus, type MachineRead } from '../../services/api';

export default function ControlSystemPage() {
  const { t } = useTranslation();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [forceUpdateConfirm, setForceUpdateConfirm] = useState(false);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [machines, setMachines] = useState<MachineRead[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [g, m] = await Promise.allSettled([api.gatewayStatus(), api.listMachines()]);
      if (cancelled) return;
      if (g.status === 'fulfilled') setGateway(g.value);
      if (m.status === 'fulfilled') setMachines(m.value);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const connectedCount = gateway?.connected_machines.length ?? 0;
  const machineTotal = machines.length;
  const wsClients = gateway?.websocket_clients ?? 0;

  const services = [
    {
      service: 'FastAPI Backend',
      ok: true,
      detail: 'Reachable',
    },
    {
      service: 'TCP Gateway',
      ok: gateway?.listening === true,
      detail: gateway ? `Port ${gateway.port}` : 'Unknown',
    },
    {
      service: 'WebSocket / Polling',
      ok: wsClients >= 0,
      detail: `${wsClients} clients`,
    },
    {
      service: 'CMC Machines',
      ok: connectedCount > 0,
      detail: `${connectedCount} / ${machineTotal} connected`,
    },
  ];

  return (
    <div>
      <Topbar title={t('control.system.title')} subtitle={t('control.system.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('control.system.pageTitle')}</h1>
            <p className="page-header__desc">{t('control.system.pageDesc')}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid-4 gap-4">
          {[
            { label: t('control.system.machinesConnected'), value: `${connectedCount} / ${machineTotal}`, icon: <Server size={18} /> },
            { label: 'WebSocket Clients', value: String(wsClients), icon: <Activity size={18} /> },
            { label: t('control.system.activeSessions'), value: gateway ? '—' : '—', icon: <Activity size={18} /> },
            { label: 'Gateway Port', value: gateway ? String(gateway.port) : '—', icon: <Server size={18} /> },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <div className="flex items-center justify-between w-full">
                <span className="stat-card__label">{s.label}</span>
                <span className="text-gray-400">{s.icon}</span>
              </div>
              <span className="stat-card__value">{s.value}</span>
            </div>
          ))}
        </div>

        <div className="grid-2 gap-6">
          {/* Maintenance Mode */}
          <div className="panel">
            <div className="panel__header">
              <div className="flex items-center gap-2">
                <Construction size={16} className="text-amber-500" />
                <h3 className="panel__title">{t('control.system.maintenanceMode')}</h3>
              </div>
            </div>
            <div className="panel__body">
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                {t('control.system.maintenanceDesc')}
              </p>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                <div className="flex items-center gap-3">
                  {maintenanceMode
                    ? <AlertTriangle size={18} className="text-amber-500" />
                    : <CheckCircle size={18} className="text-emerald-500" />}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {maintenanceMode ? t('control.system.maintenanceActive') : t('control.system.systemOnline')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {maintenanceMode ? t('control.system.usersSeeMaintenance') : t('control.system.normalAccess')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMaintenanceMode(!maintenanceMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${maintenanceMode ? 'bg-amber-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Force Update */}
          <div className="panel">
            <div className="panel__header">
              <div className="flex items-center gap-2">
                <RefreshCw size={16} className="text-blue-500" />
                <h3 className="panel__title">{t('control.system.forceUpdate')}</h3>
              </div>
            </div>
            <div className="panel__body">
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                {t('control.system.forceUpdateDesc')}
              </p>
              {!forceUpdateConfirm ? (
                <button
                  onClick={() => setForceUpdateConfirm(true)}
                  className="btn btn--primary btn--lg w-full"
                >
                  <RefreshCw size={16} /> {t('control.system.forceReload')}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button onClick={() => setForceUpdateConfirm(false)} className="btn btn--secondary flex-1">{t('common.cancel')}</button>
                    <button onClick={() => setForceUpdateConfirm(false)} className="btn btn--primary flex-1">{t('control.system.confirmButton')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="panel">
          <div className="panel__header">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-emerald-500" />
              <h3 className="panel__title">{t('control.system.systemHealth')}</h3>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t('control.system.service')}</th>
                <th style={{ width: 90 }}>{t('common.status')}</th>
                <th style={{ width: 200 }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.service}>
                  <td><span className="cell-primary">{s.service}</span></td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      {s.ok ? 'OK' : 'Offline'}
                    </span>
                  </td>
                  <td><span className="cell-muted">{s.detail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
