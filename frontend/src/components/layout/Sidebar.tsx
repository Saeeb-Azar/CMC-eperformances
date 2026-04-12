import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import {
  Radio, LayoutDashboard, Package, Server,
  BarChart3, FileText, Settings, LogOut, Zap,
  ChevronDown, Building2, Users, Wrench, Crown, Plug,
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
  {
    label: 'Development',
    items: [
      { to: '/simulator', icon: Plug, label: 'Simulator' },
    ],
  },
];

const settingsItems = [
  { to: '/settings/company', label: 'Company' },
  { to: '/settings/team', label: 'Team' },
  { to: '/settings/roles', label: 'Roles & Permissions' },
];

const controlItems = [
  { to: '/control/tenants', icon: Building2, label: 'Tenants' },
  { to: '/control/users', icon: Users, label: 'Users' },
  { to: '/control/machines', icon: Server, label: 'Machines' },
  { to: '/control/system', icon: Wrench, label: 'System' },
];

export default function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);

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

        {/* Settings (Admin) */}
        <div className="sidebar__group">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="sidebar__link"
          >
            <Settings size={15} className="sidebar__link-icon" />
            <span>Settings</span>
            <ChevronDown
              size={12}
              style={{
                marginLeft: 'auto',
                transition: 'transform 0.15s',
                transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0)',
                opacity: 0.4,
              }}
            />
          </button>
          {settingsOpen && (
            <div style={{ paddingLeft: 14 }}>
              {settingsItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                  }
                >
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Control Panel (Owner) */}
        <div className="sidebar__group">
          <button
            onClick={() => setControlOpen(!controlOpen)}
            className="sidebar__link"
          >
            <Crown size={15} className="sidebar__link-icon" />
            <span>Control Panel</span>
            <ChevronDown
              size={12}
              style={{
                marginLeft: 'auto',
                transition: 'transform 0.15s',
                transform: controlOpen ? 'rotate(180deg)' : 'rotate(0)',
                opacity: 0.4,
              }}
            />
          </button>
          {controlOpen && (
            <div style={{ paddingLeft: 14 }}>
              {controlItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                  }
                >
                  <Icon size={13} className="sidebar__link-icon" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar__bottom">
        <button className="sidebar__link">
          <LogOut size={15} className="sidebar__link-icon" />
          <span>Log out</span>
        </button>
      </div>

      <div className="sidebar__footer">&copy; 2026 ePerformances</div>
    </aside>
  );
}
