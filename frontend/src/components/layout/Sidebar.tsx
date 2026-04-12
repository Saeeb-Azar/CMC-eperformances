import { NavLink } from 'react-router-dom';
import {
  Radio, LayoutDashboard, Package, Server,
  BarChart3, FileText, Settings, LogOut, Zap,
} from 'lucide-react';

const navGroups = [
  {
    label: 'Monitor',
    items: [
      { to: '/', icon: Radio, label: 'Live Flow' },
      { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/orders', icon: Package, label: 'Packages' },
      { to: '/machines', icon: Server, label: 'Machines' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/audit', icon: FileText, label: 'Logs' },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <div className="sidebar__logo-mark">
          <Zap size={12} color="#1a1a1a" />
        </div>
        <div className="sidebar__logo-text">
          <h1>ePerformances</h1>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navGroups.map((group) => (
          <div key={group.label} className="sidebar__group">
            <div className="sidebar__group-label">{group.label}</div>
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                }
              >
                <Icon size={15} className="sidebar__link-icon" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__bottom">
        <NavLink to="/settings" className="sidebar__link">
          <Settings size={15} className="sidebar__link-icon" />
          <span>Settings</span>
        </NavLink>
        <button className="sidebar__link">
          <LogOut size={15} className="sidebar__link-icon" />
          <span>Log out</span>
        </button>
      </div>

      <div className="sidebar__footer">&copy; 2026 ePerformances</div>
    </aside>
  );
}
