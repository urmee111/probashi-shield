import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import bn from './bn';
import en from './en';

const dictionaries = { en, bn };
const STORAGE_KEY = 'ps_lang';
const I18nContext = createContext(null);

function initialLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'bn') return stored;
  return navigator.language?.toLowerCase().startsWith('bn') ? 'bn' : 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback(next => setLangState(next === 'bn' ? 'bn' : 'en'), []);

  // Looks up a key in the active language, then English, then `fallback`.
  const t = useCallback((key, vars = {}, fallback) => {
    const template = dictionaries[lang][key] ?? en[key] ?? fallback ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
