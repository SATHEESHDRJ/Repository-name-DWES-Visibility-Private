import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Single app-wide theme — Arctic Enterprise (matches technician dashboard). */
export const APP_THEME = 'arctic' as const;

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Check localStorage or system preference
    const saved = localStorage.getItem('theme-mode') as ThemeMode | null;
    if (saved) return saved;
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    // Apply theme attribute
    document.documentElement.setAttribute('data-theme', APP_THEME);
    document.documentElement.setAttribute('data-mode', mode);
    
    // Persist preference
    localStorage.setItem('theme-mode', mode);
    
    return () => { 
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute('data-mode');
    };
  }, [mode]);

  const toggleMode = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
