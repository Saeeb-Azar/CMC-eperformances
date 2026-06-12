import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import PrintAgent from '../print/PrintAgent';
import { useIsMobile } from '../../hooks/useIsMobile';

// Mobile-Navigation: auf dem Handy wird die Sidebar zum Off-Canvas-Drawer.
// Der State lebt hier im Layout; die Topbar (pro Seite gerendert) holt sich
// setOpen über diesen Context und zeigt dort ihren Hamburger-Button an.
// Seiten OHNE Topbar (z.B. LiveFlow) bekommen stattdessen einen fixen
// Floating-Button oben links — dafür registrieren sich Topbars beim Mount,
// damit das Layout weiß, ob gerade eine sichtbar ist.
interface MobileNavContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Topbar meldet sich an; Rückgabewert ist die Abmelde-Funktion (für unmount). */
  registerTopbar: () => () => void;
}

const MobileNavContext = createContext<MobileNavContextValue>({
  open: false,
  setOpen: () => {},
  registerTopbar: () => () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useMobileNav() {
  return useContext(MobileNavContext);
}

export default function AppLayout() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [topbarCount, setTopbarCount] = useState(0);

  // Drawer bei jedem Routenwechsel schließen (Nav-Link-Klick im Drawer)
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // Hintergrund nicht scrollen lassen, solange der Drawer offen ist
  useEffect(() => {
    if (isMobile && navOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobile, navOpen]);

  const registerTopbar = useCallback(() => {
    setTopbarCount((c) => c + 1);
    return () => setTopbarCount((c) => c - 1);
  }, []);

  const ctx = useMemo(
    () => ({ open: navOpen, setOpen: setNavOpen, registerTopbar }),
    [navOpen, registerTopbar],
  );

  return (
    <MobileNavContext.Provider value={ctx}>
      <div className="app-shell">
        <Sidebar
          mobileOpen={isMobile && navOpen}
          onNavigate={isMobile ? () => setNavOpen(false) : undefined}
        />

        {/* Halbtransparenter Backdrop hinter dem Drawer — Klick schließt */}
        {isMobile && navOpen && (
          <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
        )}

        {/* Fallback-Hamburger für Seiten ohne Topbar (nur Mobile) */}
        {isMobile && topbarCount === 0 && (
          <button
            type="button"
            className="mobile-nav-fab"
            onClick={() => setNavOpen(true)}
            aria-label="Navigation öffnen"
          >
            <Menu size={20} />
          </button>
        )}

        <main className="app-main">
          <Outlet />
        </main>
      </div>
      {/* Browser-Druck-Agent (QZ Tray) — läuft im offenen Tab, druckt
          fertige Labels automatisch an den LAN-Drucker. */}
      <PrintAgent />
    </MobileNavContext.Provider>
  );
}
