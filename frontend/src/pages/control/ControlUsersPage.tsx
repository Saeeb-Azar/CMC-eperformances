import Topbar from '../../components/layout/Topbar';
import { UserCircle, Plus, Search, MoreVertical } from 'lucide-react';

const roleBadge: Record<string, { label: string; cls: string }> = {
  owner: { label: 'Owner', cls: 'badge badge--accent' },
  admin: { label: 'Admin', cls: 'badge badge--info' },
  operator: { label: 'Operator', cls: 'badge badge--warning' },
  viewer: { label: 'Viewer', cls: 'badge badge--neutral' },
};

const demoUsers = [
  { id: '1', name: 'Saeeb Azar', email: 'saeeb@eperformances.de', role: 'owner', tenant: 'ePerformances', lastLogin: '12.04.2026 14:30', isActive: true },
  { id: '2', name: 'Max Müller', email: 'max@mueller-versand.de', role: 'admin', tenant: 'Müller Versand GmbH', lastLogin: '12.04.2026 13:15', isActive: true },
  { id: '3', name: 'Anna Schmidt', email: 'anna@mueller-versand.de', role: 'operator', tenant: 'Müller Versand GmbH', lastLogin: '12.04.2026 11:42', isActive: true },
  { id: '4', name: 'Jonas Weber', email: 'jonas@mueller-versand.de', role: 'operator', tenant: 'Müller Versand GmbH', lastLogin: '11.04.2026 16:20', isActive: true },
  { id: '5', name: 'Lisa Becker', email: 'lisa@packship.de', role: 'admin', tenant: 'PackShip Solutions', lastLogin: '12.04.2026 09:05', isActive: true },
  { id: '6', name: 'Tom Fischer', email: 'tom@packship.de', role: 'operator', tenant: 'PackShip Solutions', lastLogin: '10.04.2026 17:30', isActive: true },
  { id: '7', name: 'Sarah Klein', email: 'sarah@quickbox.de', role: 'admin', tenant: 'QuickBox DE', lastLogin: '12.04.2026 08:10', isActive: true },
  { id: '8', name: 'Peter Hoffmann', email: 'peter@logipack.io', role: 'admin', tenant: 'LogiPack International', lastLogin: '05.03.2026 14:00', isActive: false },
];

export default function ControlUsersPage() {
  return (
    <div>
      <Topbar title="Users" subtitle="Control Panel" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Users</h1>
            <p className="page-header__desc">All users across all tenants</p>
          </div>
          <button className="btn btn--primary btn--lg"><Plus size={16} /> Add User</button>
        </div>

        {/* Filter + Search */}
        <div className="flex items-center justify-between">
          <div style={{ position: 'relative', width: 280 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
            <input type="text" placeholder="Search users..." className="input input--with-icon" />
          </div>
          <div className="filter-tabs">
            {['All', 'Owner', 'Admin', 'Operator', 'Viewer'].map((f, i) => (
              <button key={f} className={`filter-tab ${i === 0 ? 'filter-tab--active' : ''}`}>{f}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>User</th>
                <th style={{ width: 110 }}>Role</th>
                <th style={{ width: 180 }}>Tenant</th>
                <th style={{ width: 150 }}>Last Login</th>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {demoUsers.map(u => {
                const rb = roleBadge[u.role];
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                        <UserCircle size={18} className="text-gray-400" />
                      </div>
                    </td>
                    <td>
                      <span className="cell-primary block">{u.name}</span>
                      <span className="cell-muted block mt-0.5">{u.email}</span>
                    </td>
                    <td><span className={rb.cls}>{rb.label}</span></td>
                    <td>{u.tenant}</td>
                    <td><span className="cell-mono">{u.lastLogin}</span></td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td><button className="btn-icon"><MoreVertical size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
