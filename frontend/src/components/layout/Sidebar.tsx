import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Plug, LogOut, Zap } from 'lucide-react';

// Minimal sidebar — only the two views we need to bring the machine integration
// up locally: the live Dashboard (one row per package) and the Simulator
// connection page. All other pages still exist as routes but are hidden until
// the core flow is solid.
export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login', { replace: true });
  };

  const items = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/simulator', icon: Plug, label: t('nav.simulator') },
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
