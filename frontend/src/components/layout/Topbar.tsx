import { Eye, Code, Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TopbarProps {
  title: string;
  subtitle?: string;
  liveStatus?: string;
  showViewToggle?: boolean;
}

export default function Topbar({ title, subtitle, liveStatus, showViewToggle = false }: TopbarProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'operator' | 'technical'>('operator');

  const toggleLang = () => {
    const next = i18n.language === 'de' ? 'en' : 'de';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  return (
    <div className="topbar">
      {/* Left */}
      <div className="topbar__left">
        <span className="topbar__title">{title}</span>
        {subtitle && <span className="topbar__subtitle">&middot; {subtitle}</span>}
      </div>

      {/* Center: live status */}
      {liveStatus && (
        <div className="topbar__center">
          <span className="topbar__live-dot" />
          <span className="topbar__live-text">{liveStatus}</span>
        </div>
      )}

      {/* Right */}
      <div className="topbar__right">
        {showViewToggle && (
          <div className="segmented">
            <button
              onClick={() => setView('operator')}
              className={`segmented__item ${view === 'operator' ? 'segmented__item--active' : ''}`}
            >
              <Eye size={13} /> {t('topbar.operator')}
            </button>
            <button
              onClick={() => setView('technical')}
              className={`segmented__item ${view === 'technical' ? 'segmented__item--active' : ''}`}
            >
              <Code size={13} /> {t('topbar.technical')}
            </button>
          </div>
        )}

        {/* Language switcher */}
        <button
          onClick={toggleLang}
          className="segmented"
          style={{ cursor: 'pointer', border: 'none' }}
        >
          <span className={`segmented__item ${i18n.language === 'de' ? 'segmented__item--active' : ''}`} style={{ padding: '4px 8px', fontSize: 11 }}>DE</span>
          <span className={`segmented__item ${i18n.language === 'en' ? 'segmented__item--active' : ''}`} style={{ padding: '4px 8px', fontSize: 11 }}>EN</span>
        </button>

        <button className="btn-icon" aria-label="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </div>
  );
}
