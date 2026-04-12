import Topbar from '../../components/layout/Topbar';
import { UserCircle, Plus, Search, MoreVertical, Mail } from 'lucide-react';

const roleBadge: Record<string, { label: string; cls: string }> = {
  admin: { label: 'Admin', cls: 'badge badge--info' },
  operator: { label: 'Operator', cls: 'badge badge--warning' },
  viewer: { label: 'Viewer', cls: 'badge badge--neutral' },
};

const demoTeam = [
  { id: '1', name: 'Max Müller', email: 'max@mueller-versand.de', role: 'admin', lastLogin: '12.04.2026 13:15', isActive: true },
  { id: '2', name: 'Anna Schmidt', email: 'anna@mueller-versand.de', role: 'operator', lastLogin: '12.04.2026 11:42', isActive: true },
  { id: '3', name: 'Jonas Weber', email: 'jonas@mueller-versand.de', role: 'operator', lastLogin: '11.04.2026 16:20', isActive: true },
  { id: '4', name: 'Sophie Braun', email: 'sophie@mueller-versand.de', role: 'viewer', lastLogin: '10.04.2026 09:30', isActive: true },
  { id: '5', name: 'Tim Schäfer', email: 'tim@mueller-versand.de', role: 'operator', lastLogin: '09.04.2026 14:15', isActive: true },
  { id: '6', name: 'Laura Wagner', email: 'laura@mueller-versand.de', role: 'viewer', lastLogin: '25.03.2026 10:00', isActive: false },
];

const pendingInvites = [
  { email: 'new-hire@mueller-versand.de', role: 'operator', sentAt: '12.04.2026' },
];

export default function SettingsTeamPage() {
  return (
    <div>
      <Topbar title="Team" subtitle="Settings" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Team</h1>
            <p className="page-header__desc">Manage your team members and access</p>
          </div>
          <button className="btn btn--primary btn--lg"><Plus size={16} /> Invite Member</button>
        </div>

        {/* Stats */}
        <div className="grid-4 gap-4">
          {[
            { label: 'Team Members', value: demoTeam.length },
            { label: 'Admins', value: demoTeam.filter(u => u.role === 'admin').length },
            { label: 'Operators', value: demoTeam.filter(u => u.role === 'operator').length },
            { label: 'Pending Invites', value: pendingInvites.length },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div className="hero-panel">
            <div className="hero-panel__accent hero-panel__accent--active" />
            <div className="px-8 py-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Pending Invitations</h4>
              {pendingInvites.map(inv => (
                <div key={inv.email} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail size={16} className="text-blue-500" />
                    <span className="text-sm text-gray-700">{inv.email}</span>
                    <span className={roleBadge[inv.role].cls}>{inv.role}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Sent {inv.sentAt}</span>
                    <button className="btn btn--ghost text-xs">Resend</button>
                    <button className="btn btn--ghost text-xs text-red-500">Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
          <input type="text" placeholder="Search team members..." className="input input--with-icon" />
        </div>

        {/* Team table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Member</th>
                <th style={{ width: 110 }}>Role</th>
                <th style={{ width: 150 }}>Last Login</th>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {demoTeam.map(u => {
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
