import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Radio, LayoutDashboard, Package, Server,
  BarChart3, FileText, Settings, LogOut, Zap,
  ChevronDown, Building2, Users, Wrench, Crown, Plug,
} from 'lucide-react';

export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login', { replace: true });
  };

  const navGroups = [
    {
      label: t('nav.monitor'),
      items: [
        { to: '/', icon: Radio, label: t('nav.liveFlow') },
        { to: '/dashboard', icon: LayoutDashboard, label: t('nav.overview') },
      ],
    },
    {
      label: t('nav.operations'),
      items: [
        { to: '/orders', icon: Package, label: t('nav.packages') },
        { to: '/machines', icon: Server, label: t('nav.machines') },
      ],
    },
    {
      label: t('nav.insights'),
      items: [
        { to: '/analytics', icon: BarChart3, label: t('nav.analytics') },
        { to: '/audit', icon: FileText, label: t('nav.logs') },
      ],
    },
    {
      label: t('nav.development'),
      items: [
        { to: '/simulator', icon: Plug, label: t('nav.simulator') },
      ],
    },
  ];

  const settingsItems = [
    { to: '/settings/company', label: t('nav.company') },
    { to: '/settings/team', label: t('nav.team') },
    { to: '/settings/roles', label: t('nav.rolesPermissions') },
  ];

  const controlItems = [
    { to: '/control/tenants', icon: Building2, label: t('nav.tenants') },
    { to: '/control/users', icon: Users, label: t('nav.users') },
    { to: '/control/machines', icon: Server, label: t('nav.machines') },
    { to: '/control/system', icon: Wrench, label: t('nav.system') },
  ];

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
          <button onClick={() => setSettingsOpen(!settingsOpen)} className="sidebar__link">
            <Settings size={15} className="sidebar__link-icon" />
            <span>{t('nav.settings')}</span>
            <ChevronDown size={12} style={{ marginLeft: 'auto', transition: 'transform 0.15s', transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0)', opacity: 0.4 }} />
          </button>
          {settingsOpen && (
            <div style={{ paddingLeft: 14 }}>
              {settingsItems.map(({ to, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}>
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Control Panel (Owner) */}
        <div className="sidebar__group">
          <button onClick={() => setControlOpen(!controlOpen)} className="sidebar__link">
            <Crown size={15} className="sidebar__link-icon" />
            <span>{t('nav.controlPanel')}</span>
            <ChevronDown size={12} style={{ marginLeft: 'auto', transition: 'transform 0.15s', transform: controlOpen ? 'rotate(180deg)' : 'rotate(0)', opacity: 0.4 }} />
          </button>
          {controlOpen && (
            <div style={{ paddingLeft: 14 }}>
              {controlItems.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}>
                  <Icon size={13} className="sidebar__link-icon" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar__bottom">
        <button className="sidebar__link" onClick={handleLogout} type="button">
          <LogOut size={15} className="sidebar__link-icon" />
          <span>{t('nav.logout')}</span>
        </button>
      </div>

      <div className="sidebar__footer">&copy; 2026 ePerformances</div>
    </aside>
  );
}
