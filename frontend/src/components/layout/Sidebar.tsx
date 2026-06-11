import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Plug, LogOut, Zap, Server, Settings, ScrollText } from 'lucide-react';

// Sidebar nav. Dashboard + Simulator are the day-to-day views; Maschinen and
// Einstellungen are needed to configure the Pulpo pick-location and the
// Test-Modus. Further pages exist as routes but stay hidden for now.
export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login', { replace: true });
  };

  const items = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard', 'Dashboard') },
    { to: '/machines', icon: Server, label: t('nav.machines', 'Maschinen') },
    { to: '/simulator', icon: Plug, label: t('nav.simulator') },
    { to: '/protokoll', icon: ScrollText, label: t('nav.protokoll', 'Protokoll') },
    { to: '/settings/company', icon: Settings, label: t('nav.settings', 'Einstellungen') },
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
        <div className="sidebar__group">
          {items.map(({ to, icon: Icon, label }) => (
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
