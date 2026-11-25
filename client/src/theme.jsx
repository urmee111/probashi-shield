import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Must match the inline script in index.html, which applies the theme before React mounts.
export const THEME_STORAGE_KEY = 'probashishield_theme';
const PREFERENCES = ['light', 'dark', 'system'];
const darkQuery = '(prefers-color-scheme: dark)';

const ThemeContext = createContext(null);

function storedPreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return PREFERENCES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

const systemTheme = () => (window.matchMedia?.(darkQuery).matches ? 'dark' : 'light');

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(storedPreference);
  const [system, setSystem] = useState(systemTheme);
  const resolved = preference === 'system' ? system : preference;

  // Follow OS theme changes live, so "System" updates without a reload.
  useEffect(() => {
    const media = window.matchMedia?.(darkQuery);
    if (!media) return undefined;
    const onChange = event => setSystem(event.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((value) => {
    if (!PREFERENCES.includes(value)) return;
    setPreferenceState(value);
    try { localStorage.setItem(THEME_STORAGE_KEY, value); } catch { /* storage may be blocked */ }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
