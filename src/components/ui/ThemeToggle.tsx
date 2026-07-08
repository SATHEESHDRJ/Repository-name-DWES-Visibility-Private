import { Moon, Sun } from './icons';
import { useTheme } from '../layout/ThemeProvider';

export default function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="theme-toggle"
      aria-label={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}
