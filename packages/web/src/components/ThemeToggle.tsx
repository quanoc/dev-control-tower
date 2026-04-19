import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../store/theme';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
      title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
      aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-gray-500" />
      ) : (
        <Moon className="w-4 h-4 text-gray-600" />
      )}
    </button>
  );
}