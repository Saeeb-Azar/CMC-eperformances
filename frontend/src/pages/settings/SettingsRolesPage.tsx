import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import { Shield, ShieldCheck, Eye, Crown, Check, X } from 'lucide-react';

interface Permission {
  key: string;
  label: string;
  description: string;
}

export default function SettingsRolesPage() {
  const { t } = useTranslation();

  const permissions: Permission[] = [
    { key: 'dashboard.view', label: t('settings.roles.viewDashboard'), description: t('settings.roles.viewDashboardDesc') },
    { key: 'live.view', label: t('settings.roles.viewLive'), description: t('settings.roles.viewLiveDesc') },
    { key: 'orders.view', label: t('settings.roles.viewOrders'), description: t('settings.roles.viewOrdersDesc') },
    { key: 'orders.resolve', label: t('settings.roles.resolveOrders'), description: t('settings.roles.resolveOrdersDesc') },
    { key: 'machines.view', label: t('settings.roles.viewMachines'), description: t('settings.roles.viewMachinesDesc') },
    { key: 'machines.configure', label: t('settings.roles.configureMachines'), description: t('settings.roles.configureMachinesDesc') },
    { key: 'analytics.view', label: t('settings.roles.viewAnalytics'), description: t('settings.roles.viewAnalyticsDesc') },
    { key: 'audit.view', label: t('settings.roles.viewAudit'), description: t('settings.roles.viewAuditDesc') },
    { key: 'settings.team', label: t('settings.roles.manageTeam'), description: t('settings.roles.manageTeamDesc') },
    { key: 'settings.roles', label: t('settings.roles.manageRoles'), description: t('settings.roles.manageRolesDesc') },
    { key: 'settings.company', label: t('settings.roles.editCompany'), description: t('settings.roles.editCompanyDesc') },
  ];

  const roles = [
    {
      key: 'admin', label: t('roles.admin'), description: t('settings.roles.fullAccess'),
      icon: <ShieldCheck size={16} />,
      permissions: permissions.map(p => p.key),
    },
    {
      key: 'operator', label: t('roles.operator'), description: t('settings.roles.dayToDay'),
      icon: <Shield size={16} />,
      permissions: ['dashboard.view', 'live.view', 'orders.view', 'orders.resolve', 'machines.view', 'analytics.view', 'audit.view'],
    },
    {
      key: 'viewer', label: t('roles.viewer'), description: t('settings.roles.readOnly'),
      icon: <Eye size={16} />,
      permissions: ['dashboard.view', 'live.view', 'orders.view', 'machines.view'],
    },
  ];

  return (
    <div>
      <Topbar title={t('settings.roles.title')} subtitle={t('settings.roles.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('settings.roles.pageTitle')}</h1>
            <p className="page-header__desc">{t('settings.roles.pageDesc')}</p>
          </div>
        </div>

        {/* Role cards */}
        <div className="grid-3 gap-4">
          {roles.map(r => (
            <div key={r.key} className="panel">
              <div className="panel__body">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-gray-600">{r.icon}</span>
                  <h3 className="text-sm font-semibold text-gray-900">{r.label}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">{r.description}</p>
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">{r.permissions.length}</span> {t('settings.roles.ofPermissions', { total: permissions.length })}
                </p>
                <div className="w-full bg-gray-100 rounded h-1.5 mt-2">
                  <div className="bg-blue-500 h-1.5 rounded" style={{ width: `${(r.permissions.length / permissions.length) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Owner notice */}
        <div className="hero-panel">
          <div className="hero-panel__accent hero-panel__accent--active" style={{ background: '#7c3aed' }} />
          <div className="flex items-center gap-3 px-8 py-4">
            <Crown size={16} className="text-purple-600" />
            <p className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: t('settings.roles.ownerNote') }} />
          </div>
        </div>

        {/* Permissions matrix */}
        <div className="panel">
          <div className="panel__header">
            <h3 className="panel__title">{t('settings.roles.permissionMatrix')}</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t('settings.roles.permissionMatrix')}</th>
                {roles.map(r => (
                  <th key={r.key} style={{ width: 100, textAlign: 'center' }}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map(p => (
                <tr key={p.key}>
                  <td>
                    <span className="cell-primary block">{p.label}</span>
                    <span className="cell-muted block mt-0.5">{p.description}</span>
                  </td>
                  {roles.map(r => (
                    <td key={r.key} style={{ textAlign: 'center' }}>
                      {r.permissions.includes(p.key) ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50">
                          <Check size={14} className="text-emerald-600" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-50">
                          <X size={14} className="text-gray-300" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
