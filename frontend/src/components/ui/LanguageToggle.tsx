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
    return (
      <div className="flex items-center gap-0.5 rounded bg-gray-800 p-0.5" role="group" aria-label="Language">
        {(['de', 'en'] as Lang[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLang(lang)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              current === lang ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
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
