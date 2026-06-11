import { Eye, Code, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NotificationBell from './NotificationBell';
import LanguageToggle from '../ui/LanguageToggle';
import SessionClock from '../ui/SessionClock';
import { useMobileNav } from './AppLayout';
import { useIsMobile } from '../../hooks/useIsMobile';

interface TopbarProps {
  title: string;
  subtitle?: string;
  liveStatus?: string;
  showViewToggle?: boolean;
}

export default function Topbar({ title, subtitle, liveStatus, showViewToggle = false }: TopbarProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'operator' | 'technical'>('operator');
  const isMobile = useIsMobile();
  const { setOpen, registerTopbar } = useMobileNav();

  // Beim Layout anmelden, damit es seinen Fallback-Hamburger (Floating-
  // Button) ausblendet, solange diese Topbar sichtbar ist.
  useEffect(() => registerTopbar(), [registerTopbar]);

  return (
    <div className="topbar">
      {/* Left */}
      <div className="topbar__left">
        {/* Mobile: Hamburger öffnet den Sidebar-Drawer */}
        {isMobile && (
          <button
            type="button"
            className="topbar__menu-btn"
            onClick={() => setOpen(true)}
            aria-label="Navigation öffnen"
          >
            <Menu size={20} />
          </button>
        )}
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
        {/* Operator/Technik-Umschalter passt nicht auf schmale Screens */}
        {showViewToggle && !isMobile && (
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

        {/* Session-Uhr: „angemeldet seit". Auf sehr schmalen Phones blenden
            wir sie aus (Toggle + Glocke haben Vorrang). */}
        {!isMobile && <SessionClock />}
        {/* Language switcher */}
        <LanguageToggle />

        <NotificationBell />
      </div>
    </div>
  );
}
