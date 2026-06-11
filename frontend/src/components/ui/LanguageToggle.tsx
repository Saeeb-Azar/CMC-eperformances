import { useTranslation } from 'react-i18next';

type Lang = 'de' | 'en';

interface LanguageToggleProps {
  /** 'light' fits the standard topbar, 'dark' fits dark status bars / hero areas. */
  variant?: 'light' | 'dark';
}

/**
 * Reusable DE/EN language switcher. Persists the chosen language via
 * i18n (see i18n/index.ts, localStorage key 'cmc.lang').
 */
export default function LanguageToggle({ variant = 'light' }: LanguageToggleProps) {
  const { i18n } = useTranslation();
  const current: Lang = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'de';

  const setLang = (next: Lang) => {
    if (next !== current) i18n.changeLanguage(next);
  };

  if (variant === 'dark') {
    // Gleicher Pill-Look wie der helle .segmented-Schalter, nur auf dunklem
    // Grund — bewusst Inline-Styles (keine Tailwind-Abhängigkeit).
    return (
      <div
        role="group"
        aria-label="Language"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: 2, borderRadius: 7, flexShrink: 0,
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        {(['de', 'en'] as Lang[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLang(lang)}
            style={{
              padding: '3px 8px', borderRadius: 5, border: 'none',
              fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              cursor: 'pointer', lineHeight: 1.2,
              background: current === lang ? '#fff' : 'transparent',
              color: current === lang ? '#0f172a' : 'rgba(255,255,255,0.55)',
            }}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="segmented" role="group" aria-label="Language">
      {(['de', 'en'] as Lang[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLang(lang)}
          className={`segmented__item ${current === lang ? 'segmented__item--active' : ''}`}
          style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
