import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Kleine „seit Login"-Uhr für die Topbar. Liest den Zeitstempel, den die
 * LoginPage in localStorage unter `cmc.loginAt` ablegt, und tickt einmal pro
 * Minute. Bei kurzen Sitzungen erscheint zusätzlich die Sekunden-Komponente
 * (über setInterval 1s, sonst zappelt nichts).
 */
export default function SessionClock({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { t } = useTranslation();
  const [loginAt, setLoginAt] = useState<number | null>(() => {
    const raw = localStorage.getItem('cmc.loginAt');
    return raw ? Number(raw) : null;
  });
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    // Sekundentakt: deckt sowohl <1min als auch saubere Minuten-Übergänge ab.
    const id = setInterval(() => setNow(Date.now()), 1000);
    // localStorage-Änderungen in anderen Tabs spiegeln.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cmc.loginAt') setLoginAt(e.newValue ? Number(e.newValue) : null);
    };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(id); window.removeEventListener('storage', onStorage); };
  }, []);

  if (!loginAt) return null;
  const seconds = Math.max(0, Math.floor((now - loginAt) / 1000));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  let label: string;
  if (d > 0) label = `${d}${t('session.short.d', 'd')} ${h}${t('session.short.h', 'h')}`;
  else if (h > 0) label = `${h}${t('session.short.h', 'h')} ${m.toString().padStart(2, '0')}${t('session.short.m', 'm')}`;
  else if (m > 0) label = `${m}${t('session.short.m', 'm')} ${s.toString().padStart(2, '0')}${t('session.short.s', 's')}`;
  else label = `${s}${t('session.short.s', 's')}`;

  const dark = variant === 'dark';
  return (
    <span
      title={t('session.tooltip', 'Angemeldet seit dem letzten Login')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: 6,
        fontSize: 11.5, fontWeight: 600, lineHeight: 1.2,
        fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
        background: dark ? 'rgba(255,255,255,0.10)' : 'var(--clr-bg-subtle, #f4f6fa)',
        color: dark ? 'rgba(255,255,255,0.85)' : 'var(--clr-text-muted, #64748b)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'var(--clr-border)'}`,
      }}
    >
      <Clock size={12} />
      {label}
    </span>
  );
}
