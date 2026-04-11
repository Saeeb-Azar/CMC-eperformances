import { NavLink } from 'react-router-dom';
import {
  Radio,
  LayoutDashboard,
  Package,
  Server,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  Zap,
} from 'lucide-react';

const navGroups = [
  {
    label: 'Monitor',
    items: [
      { to: '/', icon: Radio, label: 'Live Flow', badge: null },
      { to: '/dashboard', icon: LayoutDashboard, label: 'Overview', badge: null },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/orders', icon: Package, label: 'Packages', badge: null },
      { to: '/machines', icon: Server, label: 'Machines', badge: null },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'Analytics', badge: null },
      { to: '/audit', icon: FileText, label: 'Logs', badge: null },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar__logo">
        <div className="sidebar__logo-mark">
          <Zap size={16} color="white" />
        </div>
        <div className="sidebar__logo-text">
          <h1>ePerformances</h1>
          <p>CMC CartonWrap</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="sidebar__nav">
        {navGroups.map((group) => (
          <div key={group.label} className="sidebar__group">
            <div className="sidebar__group-label">{group.label}</div>
            {group.items.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                }
              >
                <Icon size={18} className="sidebar__link-icon" />
                <span>{label}</span>
                {badge && <span className="sidebar__link-badge">{badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="sidebar__bottom">
        <NavLink to="/settings" className="sidebar__link">
          <Settings size={18} className="sidebar__link-icon" />
          <span>Settings</span>
        </NavLink>
        <button className="sidebar__link">
          <LogOut size={18} className="sidebar__link-icon" />
          <span>Log out</span>
        </button>
      </div>

      <div className="sidebar__footer">&copy; 2026, ePerformances</div>
    </aside>
  );
}
