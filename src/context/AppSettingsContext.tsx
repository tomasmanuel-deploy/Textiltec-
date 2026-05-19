import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type Language = 'pt' | 'en';

interface AppSettingsContextValue {
  theme: Theme;
  language: Language;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [language, setLanguage] = useState<Language>('pt');

  // Load from localStorage on first mount
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('appSettings') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.theme) setTheme(parsed.theme);
        if (parsed?.language) setLanguage(parsed.language);
      }
    } catch {}
  }, []);

  // Apply theme and language to documentElement and persist
  useEffect(() => {
    try {
      const el = document.documentElement;
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
      el.classList.toggle('dark', isDark);
      el.setAttribute('lang', language);
      window.localStorage.setItem('appSettings', JSON.stringify({ theme, language }));
    } catch {}
  }, [theme, language]);

  const value = useMemo(() => ({ theme, language, setTheme, setLanguage }), [theme, language]);

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}