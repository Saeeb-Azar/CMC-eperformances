import Topbar from '../../components/layout/Topbar';
import { Shield, ShieldCheck, Eye, Crown, Check, X } from 'lucide-react';

interface Permission {
  key: string;
  label: string;
  description: string;
}

const permissions: Permission[] = [
  { key: 'dashboard.view', label: 'View Dashboard', description: 'KPIs, charts, overview' },
  { key: 'live.view', label: 'View Live Monitor', description: 'Real-time conveyor status' },
  { key: 'orders.view', label: 'View Orders', description: 'Order list and details' },
  { key: 'orders.resolve', label: 'Resolve Orders', description: 'Mark ejected/failed as resolved' },
  { key: 'machines.view', label: 'View Machines', description: 'Machine list and status' },
  { key: 'machines.configure', label: 'Configure Machines', description: 'Edit machine settings' },
  { key: 'analytics.view', label: 'View Analytics', description: 'Charts, dimensions, weights' },
  { key: 'audit.view', label: 'View Audit Log', description: 'System events and transitions' },
  { key: 'settings.team', label: 'Manage Team', description: 'Invite, remove, edit members' },
  { key: 'settings.roles', label: 'Manage Roles', description: 'Edit role permissions' },
  { key: 'settings.company', label: 'Edit Company', description: 'Company profile, subscription' },
];

const roles = [
  {
    key: 'admin', label: 'Admin', description: 'Full access to all tenant features',
    icon: <ShieldCheck size={16} />,
    permissions: permissions.map(p => p.key),
  },
  {
    key: 'operator', label: 'Operator', description: 'Day-to-day operations',
    icon: <Shield size={16} />,
    permissions: ['dashboard.view', 'live.view', 'orders.view', 'orders.resolve', 'machines.view', 'analytics.view', 'audit.view'],
  },
  {
    key: 'viewer', label: 'Viewer', description: 'Read-only access',
    icon: <Eye size={16} />,
    permissions: ['dashboard.view', 'live.view', 'orders.view', 'machines.view'],
  },
];

export default function SettingsRolesPage() {
  return (
    <div>
      <Topbar title="Roles & Permissions" subtitle="Settings" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Roles & Permissions</h1>
            <p className="page-header__desc">Define what each role can access</p>
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
                  <span className="font-semibold">{r.permissions.length}</span> of {permissions.length} permissions
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
            <p className="text-sm text-gray-700">
              <strong>Owner</strong> role is platform-level and has access to the Control Panel. It cannot be assigned within tenant settings.
            </p>
          </div>
        </div>

        {/* Permissions matrix */}
        <div className="panel">
          <div className="panel__header">
            <h3 className="panel__title">Permission Matrix</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Permission</th>
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
