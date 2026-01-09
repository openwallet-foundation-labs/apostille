'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SunIcon, MoonIcon, ComputerIcon } from './ui/Icons';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Load theme from localStorage
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    if (storedTheme) {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    const updateTheme = () => {
      let newActualTheme: 'light' | 'dark';

      if (theme === 'system') {
        newActualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        newActualTheme = theme;
      }

      setActualTheme(newActualTheme);

      // Update document class for theme switching
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newActualTheme);

      // Store theme preference
      localStorage.setItem('theme', theme);
    };

    updateTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('system');
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme: handleSetTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Theme toggle button component
export function ThemeToggle() {
  const { theme, actualTheme, toggleTheme } = useTheme();

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <SunIcon className="w-5 h-5" />;
      case 'dark':
        return <MoonIcon className="w-5 h-5" />;
      case 'system':
        return <ComputerIcon className="w-5 h-5" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Light mode';
      case 'dark':
        return 'Dark mode';
      case 'system':
        return `Auto (${actualTheme})`;
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={getLabel()}
      aria-label={getLabel()}
    >
      <span className="transition-transform duration-300 hover:scale-110">
        {getIcon()}
      </span>
      <span className="hidden sm:inline">
        {getLabel()}
      </span>
    </button>
  );
}

// System theme detector hook
export function useSystemTheme() {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return systemTheme;
}

// Color scheme meta tag updater
export function ColorSchemeUpdater() {
  const { actualTheme } = useTheme();

  useEffect(() => {
    // Update the color-scheme meta tag
    const metaTag = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement;
    if (metaTag) {
      metaTag.content = actualTheme;
    } else {
      const newMetaTag = document.createElement('meta');
      newMetaTag.name = 'color-scheme';
      newMetaTag.content = actualTheme;
      document.head.appendChild(newMetaTag);
    }

    // Update the theme-color meta tag
    const themeColorTag = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    const themeColor = actualTheme === 'dark' ? '#0f172a' : '#f8fafc';
    if (themeColorTag) {
      themeColorTag.content = themeColor;
    } else {
      const newThemeColorTag = document.createElement('meta');
      newThemeColorTag.name = 'theme-color';
      newThemeColorTag.content = themeColor;
      document.head.appendChild(newThemeColorTag);
    }
  }, [actualTheme]);

  return null;
} 