'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LogoMark, Wordmark } from '../brand/Logo';
import { ThemeToggle } from '../ui/ThemeProvider';
import { SOCIALS, SITE } from '@/config/site';
import { useAuth } from '@/lib/auth-context';
import { useSiteSettings } from '@/lib/site-content';
import { Icon } from '@/components/ui/Icon';

const LINKS = [
  { href: '/', label: 'الرئيسية' },
  { href: '/news', label: 'الأخبار' },
  { href: '/offers', label: 'العروض' },
];

export function BrandLink({ size = 36 }: { size?: number }) {
  const { accessToken } = useAuth();
  return (
    <Link href={accessToken ? '/dashboard' : '/'} className="flex items-center gap-3" aria-label="VAYRO">
      <LogoMark height={size} />
      <Wordmark height={Math.round(size * 0.5)} />
    </Link>
  );
}

const pill = 'inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold transition';

export function SiteHeader() {
  const pathname = usePathname();
  const { accessToken, isLoading } = useAuth();
  const authed = !!accessToken;
  const links = LINKS.map((l) => (l.href === '/' && authed ? { ...l, href: '/dashboard' } : l));
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-vayro-border bg-vayro-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg text-vayro-text transition hover:bg-vayro-card md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="القائمة"
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
          <BrandLink />
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`nav-ink relative px-4 py-2 text-sm transition hover:text-vayro-text ${active ? 'text-vayro-text' : 'text-vayro-muted'}`}
              >
                {l.label}
                {active && <span className="absolute inset-x-4 -bottom-[17px] h-0.5 rounded-full bg-vayro-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoading ? null : authed ? (
            <Link href="/dashboard" className={`${pill} bg-vayro-text text-vayro-bg hover:opacity-90`}>حسابي</Link>
          ) : (
            <>
              <Link href="/register" className={`${pill} btn-glow hidden sm:inline-flex`}>إنشاء حساب</Link>
              <Link href="/login" className={`${pill} bg-vayro-text text-vayro-bg hover:opacity-90`}>تسجيل الدخول</Link>
            </>
          )}
        </div>
      </div>

      {open && (
        <nav className="animate-fade-in border-t border-vayro-border bg-vayro-bg px-4 py-3 md:hidden" aria-label="القائمة">
          <div className="grid gap-1">
            {[...links, ...(isLoading ? [] : authed ? [] : [{ href: '/register', label: 'إنشاء حساب' }])].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-vayro-muted transition hover:bg-vayro-card hover:text-vayro-text">
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const site = useSiteSettings();
  const socials = SOCIALS.map((s) => ({ ...s, href: site?.['site.social']?.[s.key] || s.href })).filter((s) => s.href);
  return (
    <footer className="mt-20 border-t border-vayro-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 py-8 md:flex-row md:px-6">
        <BrandLink size={30} />
        <ul className="flex flex-wrap gap-2">
          {socials.map((s) => (
            <li key={s.key}>
              <a href={s.href} aria-label={s.label} title={s.label} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 place-items-center rounded-full border border-vayro-border text-vayro-muted transition hover:border-vayro-primary hover:text-vayro-text">
                <Icon name={s.icon} size={18} />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-vayro-muted">© {new Date().getFullYear()} {SITE.name}</p>
      </div>
    </footer>
  );
}
