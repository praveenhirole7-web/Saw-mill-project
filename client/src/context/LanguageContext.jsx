import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES } from '../i18n/languages';

const STORAGE_KEY = 'timbercraft_language';
const catalogs = import.meta.glob('../i18n/translations/*.json', {
  eager: true,
  import: 'default'
});
const catalogByLanguage = Object.fromEntries(
  Object.entries(catalogs).map(([path, catalog]) => [
    path.match(/\/([a-z]+)\.json$/)?.[1],
    catalog
  ])
);
const missingTranslationWarnings = new Set();
const LanguageContext = createContext(null);

function getInitialLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some(({ code }) => code === stored) ? stored : 'en';
  } catch (error) {
    console.warn('[i18n] Could not read the saved language preference:', error);
    return 'en';
  }
}

function lookup(catalog, key) {
  return key.split('.').reduce((value, part) => value?.[part], catalog);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  const setLanguage = useCallback((code) => {
    if (!LANGUAGES.some(({ code: supportedCode }) => supportedCode === code)) {
      console.error(`[i18n] Unsupported language code: ${code}`);
      return;
    }
    setLanguageState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (error) {
      console.warn('[i18n] Could not save the language preference:', error);
    }
  }, []);

  useEffect(() => {
    const selectedLanguage = LANGUAGES.find(({ code }) => code === language);
    document.documentElement.lang = language;
    document.documentElement.dir = selectedLanguage?.direction || 'ltr';
  }, [language]);

  const t = useCallback((key) => {
    const translated = lookup(catalogByLanguage[language], key);
    if (typeof translated === 'string') return translated;

    if (import.meta.env.DEV) {
      const warningKey = `${language}:${key}`;
      if (!missingTranslationWarnings.has(warningKey)) {
        missingTranslationWarnings.add(warningKey);
        console.warn(`[i18n] Missing "${key}" translation for "${language}"; showing English fallback.`);
      }
    }

    const fallback = lookup(catalogByLanguage.en, key);
    return typeof fallback === 'string' ? fallback : key;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    isTranslationIncomplete: language !== 'en'
  }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
