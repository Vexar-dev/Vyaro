import type { Config } from 'tailwindcss';

// كل الألوان قنوات RGB في CSS variables (انظر globals.css) حتى يشتغل
// الداكن/الفاتح وكمان معدّلات الشفافية مثل bg-vayro-primary/20
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vayro: {
          bg: c('bg'),
          surface: c('surface'),
          card: c('card'),
          border: c('border'),
          text: c('text'),
          muted: c('muted'),
          primary: c('primary'),
          primaryDark: c('primaryDark'),
          accent: c('accent'),
          glow: c('glow'),
          success: c('success'),
          danger: c('danger'),
        },
      },
      borderRadius: { xl2: '0.75rem' },
      fontFamily: {
        sans: ['"Cairo Variable"', 'Cairo', 'system-ui', 'sans-serif'],
        display: ['"Cairo Variable"', 'Cairo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 8px 22px -10px rgb(var(--primary) / .45)',
        'glow-lg': '0 22px 50px -20px rgb(0 0 0 / .7)',
        crypt: '0 22px 50px -20px rgb(0 0 0 / .7)',
      },
      keyframes: {
        'dlg-in': { from: { opacity: '0', transform: 'translateY(14px) scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(-6px) scale(.97)' }, to: { opacity: '1', transform: 'none' } },
        flicker: {
          '0%,100%': { opacity: '1' },
          '41%': { opacity: '1' },
          '42%': { opacity: '.55' },
          '43%': { opacity: '1' },
          '46%': { opacity: '.7' },
          '47%': { opacity: '1' },
        },
        drift: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(0,-14px,0)' } },
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '.55' }, '100%': { transform: 'scale(1.7)', opacity: '0' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'dlg-in': 'dlg-in .22s cubic-bezier(.2,.9,.3,1.2) both',
        'fade-in': 'fade-in .18s ease-out both',
        'toast-in': 'toast-in .28s cubic-bezier(.2,.9,.3,1) both',
        'pop-in': 'pop-in .16s ease-out both',
        flicker: 'flicker 7s infinite',
        drift: 'drift 9s ease-in-out infinite',
        'pulse-ring': 'pulseRing 2.4s ease-out infinite',
        rise: 'rise .45s cubic-bezier(.2,.8,.2,1) both',
        'spin-slow': 'spin 60s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
