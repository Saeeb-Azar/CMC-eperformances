import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';

export const LANG_STORAGE_KEY = 'cmc.lang';

// Load persisted language ('cmc.lang'); fall back to legacy 'lang' key, then German.
const stored =
  localStorage.getItem(LANG_STORAGE_KEY) || localStorage.getItem('lang');
const initialLang = stored === 'en' ? 'en' : 'de';

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: initialLang,
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    // ignore storage errors (e.g. private mode)
  }
});

export default i18n;
