import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import { useState } from 'react';
import {
  Construction,
  RefreshCw,
  Database,
  Users,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  Shield,
} from 'lucide-react';

export default function ControlSystemPage() {
  const { t } = useTranslation();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [forceUpdateConfirm, setForceUpdateConfirm] = useState(false);

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
            { label: t('control.system.activeSessions'), value: '23', icon: <Users size={18} /> },
            { label: t('control.system.machinesConnected'), value: '5 / 6', icon: <Server size={18} /> },
            { label: t('control.system.dbConnections'), value: '12', icon: <Database size={18} /> },
            { label: t('control.system.eventsPerMin'), value: '142', icon: <Activity size={18} /> },
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
              {maintenanceMode && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800"><strong>{t('control.system.maintenanceWarning', { count: 23 })}</strong></p>
                </div>
              )}
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
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800"><strong>{t('control.system.confirmReload', { count: 23 })}</strong></p>
                  </div>
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
                <th style={{ width: 100 }}>{t('control.system.latency')}</th>
                <th style={{ width: 100 }}>{t('control.system.lastCheck')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { service: 'PostgreSQL Database', status: 'healthy', latency: '2ms', lastCheck: '5s ago' },
                { service: 'FastAPI Backend', status: 'healthy', latency: '8ms', lastCheck: '5s ago' },
                { service: 'TCP Gateway', status: 'healthy', latency: '1ms', lastCheck: '30s ago' },
                { service: 'WebSocket Server', status: 'healthy', latency: '3ms', lastCheck: '5s ago' },
                { service: 'Redis Cache', status: 'warning', latency: '45ms', lastCheck: '5s ago' },
              ].map(s => (
                <tr key={s.service}>
                  <td><span className="cell-primary">{s.service}</span></td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      s.status === 'healthy' ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        s.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`} />
                      {s.status === 'healthy' ? 'OK' : 'Slow'}
                    </span>
                  </td>
                  <td><span className="cell-mono tabular-nums">{s.latency}</span></td>
                  <td><span className="cell-muted">{s.lastCheck}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
