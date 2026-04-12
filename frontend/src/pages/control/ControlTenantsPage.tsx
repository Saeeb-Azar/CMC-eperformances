import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import { Building2, Plus, Search, MoreVertical } from 'lucide-react';

const demoTenants = [
  { id: '1', name: 'Müller Versand GmbH', slug: 'mueller-versand', plan: 'enterprise', is_active: true, machines: 3, users: 12, ordersToday: 487, created: '15.01.2026' },
  { id: '2', name: 'PackShip Solutions', slug: 'packship', plan: 'pro', is_active: true, machines: 2, users: 5, ordersToday: 213, created: '22.02.2026' },
  { id: '3', name: 'QuickBox DE', slug: 'quickbox-de', plan: 'starter', is_active: true, machines: 1, users: 2, ordersToday: 64, created: '01.03.2026' },
  { id: '4', name: 'LogiPack International', slug: 'logipack', plan: 'pro', is_active: false, machines: 2, users: 8, ordersToday: 0, created: '10.11.2025' },
];

const planBadge: Record<string, string> = {
  starter: 'badge badge--neutral',
  pro: 'badge badge--info',
  enterprise: 'badge badge--accent',
};

export default function ControlTenantsPage() {
  return (
    <div>
      <Topbar title="Tenants" subtitle="Control Panel" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Tenants</h1>
            <p className="page-header__desc">Manage all companies on the platform</p>
          </div>
          <button className="btn btn--primary btn--lg"><Plus size={16} /> Add Tenant</button>
        </div>

        {/* Stats */}
        <div className="grid-4 gap-4">
          {[
            { label: 'Total Tenants', value: demoTenants.length },
            { label: 'Active', value: demoTenants.filter(t => t.is_active).length },
            { label: 'Total Machines', value: demoTenants.reduce((s, t) => s + t.machines, 0) },
            { label: 'Total Users', value: demoTenants.reduce((s, t) => s + t.users, 0) },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
          <input type="text" placeholder="Search tenants..." className="input input--with-icon" />
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Company</th>
                <th style={{ width: 100 }}>Plan</th>
                <th style={{ width: 80 }}>Machines</th>
                <th style={{ width: 70 }}>Users</th>
                <th style={{ width: 110 }}>Orders Today</th>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ width: 100 }}>Created</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {demoTenants.map(t => (
                <tr key={t.id}>
                  <td>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.is_active ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <Building2 size={16} className={t.is_active ? 'text-emerald-600' : 'text-gray-400'} />
                    </div>
                  </td>
                  <td>
                    <span className="cell-primary block">{t.name}</span>
                    <span className="cell-muted block mt-0.5">{t.slug}</span>
                  </td>
                  <td><span className={planBadge[t.plan]}>{t.plan}</span></td>
                  <td><span className="cell-primary tabular-nums">{t.machines}</span></td>
                  <td><span className="cell-primary tabular-nums">{t.users}</span></td>
                  <td><span className="cell-primary tabular-nums">{t.ordersToday.toLocaleString()}</span></td>
                  <td><StatusBadge status={t.is_active ? 'RUNNING' : 'STOP'} /></td>
                  <td><span className="cell-muted">{t.created}</span></td>
                  <td>
                    <button className="btn-icon"><MoreVertical size={14} /></button>
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
