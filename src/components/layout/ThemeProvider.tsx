import { useLayoutEffect, useState, createContext, useContext, type ReactNode } from 'react';

/**
 * App chrome + content themes (persisted).
 * `ingenious` = primary Ingenious Network brand (logo navy / teal / white / grey).
 * `default` = alternate DWES baseline kept for rollback / comparison.
 * Arctic, Harbor, Graphite remain in CSS but are hidden from the theme switcher.
 */
export type AppThemeId = 'default' | 'arctic' | 'harbor' | 'graphite' | 'ingenious';
type ThemeMode = 'light' | 'dark';

/** Themes exposed in login + in-app switchers (Default + Ingenious Network only). */
export const THEME_SWITCHER_THEMES: Array<{ id: AppThemeId; label: string; blurb: string }> = [
  {
    id: 'ingenious',
    label: 'Ingenious Network',
    blurb: 'Primary brand — deep navy, teal, white, and light grey (logo palette)',
  },
  {
    id: 'default',
    label: 'Default',
    blurb: 'Alternate DWES baseline — brand-blue chrome, high contrast',
  },
];

/** @deprecated Prefer THEME_SWITCHER_THEMES — kept for imports that list all themes. */
export const APP_THEMES = THEME_SWITCHER_THEMES;

interface ThemeContextType {
  theme: AppThemeId;
  setTheme: (id: AppThemeId) => void;
  mode: ThemeMode;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** @deprecated Prefer useTheme().theme — kept for older imports. */
export const APP_THEME = 'ingenious' as const;

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

const LEGACY_THEME_RESET_FLAG = 'dwes-theme-reset-default-20260716';
/** One-time: promote Ingenious Network as primary + light content surfaces. */
const PRIMARY_INGENIOUS_MIGRATION = 'dwes-primary-ingenious-20260717';

const RETIRED_SWITCHER_IDS: AppThemeId[] = ['arctic', 'harbor', 'graphite'];

function normalizeThemeId(id: AppThemeId | null | undefined): AppThemeId {
  if (!id) return 'ingenious';
  if (RETIRED_SWITCHER_IDS.includes(id)) return 'ingenious';
  if (THEME_SWITCHER_THEMES.some(t => t.id === id)) return id;
  return 'ingenious';
}

function readStoredTheme(): AppThemeId {
  try {
    if (!localStorage.getItem(PRIMARY_INGENIOUS_MIGRATION)) {
      localStorage.setItem(PRIMARY_INGENIOUS_MIGRATION, '1');
      localStorage.setItem(LEGACY_THEME_RESET_FLAG, '1');
      localStorage.setItem('dwes-app-theme', 'ingenious');
      localStorage.setItem('theme-mode', 'light');
      return 'ingenious';
    }
  } catch {
    return 'ingenious';
  }
  const saved = localStorage.getItem('dwes-app-theme') as AppThemeId | null;
  return normalizeThemeId(saved);
}

function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('theme-mode') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* private mode */
  }
  return 'light';
}

/** Apply theme attrs identically on every device (tokens only — no device skins). */
function applyDocumentTheme(theme: AppThemeId, mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', mode);
  root.style.colorScheme = mode;
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(() => readStoredTheme());
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode());

  useLayoutEffect(() => {
    applyDocumentTheme(theme, mode);
    try {
      localStorage.setItem('dwes-app-theme', theme);
      localStorage.setItem('theme-mode', mode);
    } catch {
      /* private mode */
    }
    return () => {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute('data-mode');
      document.documentElement.style.removeProperty('color-scheme');
    };
  }, [theme, mode]);

  const setTheme = (id: AppThemeId) => {
    const next = normalizeThemeId(id);
    if (!THEME_SWITCHER_THEMES.some(t => t.id === next)) return;
    try {
      localStorage.setItem('dwes-app-theme', next);
      localStorage.setItem(LEGACY_THEME_RESET_FLAG, '1');
      localStorage.setItem(PRIMARY_INGENIOUS_MIGRATION, '1');
    } catch { /* private mode */ }
    applyDocumentTheme(next, mode);
    setThemeState(next);
  };
  const toggleMode = () => setMode(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
