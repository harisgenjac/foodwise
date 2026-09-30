import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bs from './locales/bs.json';
import en from './locales/en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      bs: { translation: bs },
      en: { translation: en },
    },
    lng: 'bs',
    fallbackLng: 'bs',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;