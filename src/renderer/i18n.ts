import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  showSupportNotice: false, lng: 'en', fallbackLng: 'en', keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false },
});
export default i18n;

