import { NavLink, useNavigate } from 'react-router-dom';
import {
  Radio,
  LayoutDashboard,
  Package,
  Server,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: Radio, label: 'CMC Live Flow' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders', icon: Package, label: 'Orders' },
  { to: '/machines', icon: Server, label: 'Machines' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/audit', icon: FileText, label: 'Audit Log' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
  };

  return (
    <aside className="w-64 bg-sidebar h-screen flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-sidebar-border">
        <h1 className="text-lg font-semibold text-white tracking-tight">
          ePerformances
        </h1>
        <p className="text-xs text-text-on-dark-muted mt-0.5">CMC CartonWrap</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-text-on-dark-muted hover:bg-sidebar-hover hover:text-text-on-dark'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 border-t border-sidebar-border pt-4 space-y-1">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-on-dark-muted hover:bg-sidebar-hover hover:text-text-on-dark w-full transition-colors"
        >
          <Settings size={18} />
          <span>Settings</span>
          <ChevronDown
            size={14}
            className={`ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {settingsOpen && (
          <div className="pl-9 space-y-1">
            <NavLink
              to="/settings"
              className="block px-3 py-1.5 text-xs text-text-on-dark-muted hover:text-text-on-dark rounded transition-colors"
            >
              GENERAL
            </NavLink>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-on-dark-muted hover:bg-sidebar-hover hover:text-text-on-dark w-full transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>

      <div className="px-5 pb-4">
        <p className="text-xs text-text-on-dark-muted">&copy; 2026, ePerformances</p>
      </div>
    </aside>
  );
}
