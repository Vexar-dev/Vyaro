'use client';

import { useEffect, useRef, useState } from 'react';
import { SOCIALS } from '@/config/site';
import { useSiteSettings } from '@/lib/site-content';
import { Icon } from '@/components/ui/Icon';

/**
 * دائرة تواصل ثابتة في كل صفحات الموقع (زاوية أسفل اليسار).
 * زر دائري يتنفّس، وعند الضغط تتفتح دوائر الحسابات فوقه.
 */
export function SocialDock() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const site = useSiteSettings();
  const links = SOCIALS.map((s) => ({ ...s, href: site?.['site.social']?.[s.key] || s.href }));

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('touchstart', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div
      ref={root}
      dir="ltr"
      className="fixed bottom-5 left-5 z-[70] flex flex-col-reverse items-center gap-3 max-sm:bottom-4 max-sm:left-4"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'إغلاق حسابات التواصل' : 'فتح حسابات التواصل'}
        className="group relative grid h-14 w-14 place-items-center rounded-full btn-glow text-2xl transition hover:scale-105 active:scale-95"
      >
        <span className={`transition-transform duration-300 ${open ? 'rotate-90 scale-110' : ''}`}>{open ? <Icon name="close" size={22} className="text-vayro-accent" /> : <Icon name="chat" size={24} />}</span>
      </button>

      <ul
        className={`flex flex-col-reverse items-center gap-2.5 transition-all duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        {links.map((s, i) => {
          const enabled = !!s.href;
          const href = s.key === 'email' && enabled && !s.href.startsWith('mailto:') ? `mailto:${s.href}` : s.href;
          return (
            <li
              key={s.key}
              style={{ transitionDelay: open ? `${i * 35}ms` : '0ms' }}
              className={`group relative transition-all duration-300 ${open ? 'translate-y-0 scale-100' : 'translate-y-3 scale-50'}`}
            >
              <a
                href={enabled ? href : undefined}
                target={enabled ? '_blank' : undefined}
                rel="noopener noreferrer"
                aria-disabled={!enabled}
                aria-label={s.label}
                tabIndex={open ? 0 : -1}
                className={`grid h-11 w-11 place-items-center rounded-full border border-vayro-border bg-vayro-card/95 text-xl backdrop-blur transition hover:scale-110 ${
                  enabled ? '' : 'opacity-60'
                }`}
                style={{ ['--t' as string]: s.tint }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 0 22px -2px ${s.tint}, inset 0 0 0 1px ${s.tint}`)}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}
              >
                <span aria-hidden><Icon name={s.icon} size={18} /></span>
              </a>
              <span
                dir="rtl"
                className="pointer-events-none absolute left-full top-1/2 ms-3 -translate-y-1/2 translate-x-[-6px] whitespace-nowrap rounded-md border border-vayro-border bg-vayro-card px-2.5 py-1 text-xs text-vayro-text opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
              >
                {s.label}
                {!enabled && <span className="text-vayro-muted"> — قريباً</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
