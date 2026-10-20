'use client';

import { Icon } from './Icon';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'vayro-theme';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });

/** سكربت يُحقن في <head> ليحدد الثيم قبل أول رسم (بدون وميض أبيض) */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(!t){t='dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const cur = document.documentElement.getAttribute('data-theme');
    if (cur === 'light' || cur === 'dark') setTheme(cur);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      document.documentElement.classList.toggle('vignette', next === 'dark');
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* التخزين غير متاح — الثيم يبقى للجلسة فقط */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('vignette', theme === 'dark');
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
      title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
      className={`group relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-vayro-border bg-vayro-card/70 text-lg transition hover:border-vayro-primary ${className}`}
    >
      <span
        className={`absolute transition-all duration-500 ${dark ? 'translate-y-0 rotate-0 opacity-100' : '-translate-y-8 -rotate-90 opacity-0'}`}
      >
        <Icon name="moon" size={18} />
      </span>
      <span
        className={`absolute transition-all duration-500 ${dark ? 'translate-y-8 rotate-90 opacity-0' : 'translate-y-0 rotate-0 opacity-100'}`}
      >
        <Icon name="sun" size={18} />
      </span>
    </button>
  );
}
