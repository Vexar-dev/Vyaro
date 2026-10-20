'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/i18n';
import { LogoMark, Wordmark } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeProvider';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ui/Icon';

const navItems = [
  { href: '/dashboard', label: t('nav.dashboard'), icon: 'home' },
  { href: '/deposit', label: 'إيداع', icon: 'download' },
  { href: '/withdraw', label: 'سحب', icon: 'upload' },
  { href: '/store', label: 'المتجر', icon: 'cart' },
  { href: '/kyc', label: 'توثيق الهوية', icon: 'shield-check' },
  { href: '/profile', label: t('nav.profile'), icon: 'id' },
  { href: '/security', label: t('nav.security'), icon: 'shield' },
  { href: '/sessions', label: t('nav.sessions'), icon: 'devices' },
];
const extraItems = [
  { href: '/news', label: 'الأخبار', icon: 'news' },
  { href: '/offers', label: 'العروض', icon: 'gift' },
];

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const STORE_ROLES = ['STORE_ADMIN', 'ADMIN', 'SUPER_ADMIN'];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const { accessToken, user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const dlg = useDialog();
  const toast = useToast();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!isLoading && !accessToken) router.replace('/login');
  }, [isLoading, accessToken, router]);

  useEffect(() => setDrawer(false), [pathname]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="text-center">
          <LogoMark height={90} className="mx-auto" />
          <p className="mt-4 text-sm text-vayro-muted">جارِ التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }
  if (!accessToken) {
    // Redirect above is already in flight; render nothing to avoid a flash of protected UI.
    return null;
  }

  const isAdmin = !!user?.roles?.some((r) => ADMIN_ROLES.includes(r));
  const isStoreAdmin = !!user?.roles?.some((r) => STORE_ROLES.includes(r));

  async function onLogout() {
    const ok = await dlg.confirm({
      title: 'تسجيل الخروج',
      message: 'سيتم إنهاء جلستك على هذا الجهاز. تقدر تسجّل الدخول مرة ثانية بأي وقت.',
      icon: 'logout',
      confirmText: 'تسجيل الخروج',
      tone: 'danger',
    });
    if (!ok) return;
    await logout();
    toast('تم تسجيل الخروج', 'info');
    router.replace('/login');
  }

  const NavLink = ({ href, label, icon }: { href: string; label: string; icon: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition ${
          active ? 'bg-vayro-primary/15 text-vayro-text' : 'text-vayro-muted hover:bg-vayro-card hover:text-vayro-text'
        }`}
      >
        {active && <span className="absolute inset-y-2 end-0 w-0.5 animate-fade-in rounded-full bg-vayro-accent" />}
        <Icon name={icon} size={18} className="transition group-hover:-translate-y-0.5" />
        {label}
      </Link>
    );
  };

  const SidebarBody = (
    <>
      <Link href="/dashboard" className="mb-8 flex items-center gap-3" aria-label="VAYRO">
        <LogoMark height={38} />
        <Wordmark height={19} />
      </Link>
      <nav className="space-y-1" aria-label="التنقل">
        {navItems.map((i) => <NavLink key={i.href} {...i} />)}
        <div className="rune-divider my-3" />
        {extraItems.map((i) => <NavLink key={i.href} {...i} />)}
        {isAdmin && (
          <Link
            href="/admin/users"
            className={`mt-3 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition ${
              pathname?.startsWith('/admin') ? 'border-vayro-accent/60 bg-vayro-accent/10 text-vayro-text' : 'border-vayro-border text-vayro-muted hover:border-vayro-accent/60 hover:text-vayro-text'
            }`}
          >
            <Icon name="crown" size={18} /> لوحة الإدارة
          </Link>
        )}
        {isStoreAdmin && (
          <Link
            href="/store-admin/products"
            className={`mt-2 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition ${
              pathname?.startsWith('/store-admin') ? 'border-vayro-accent/60 bg-vayro-accent/10 text-vayro-text' : 'border-vayro-border text-vayro-muted hover:border-vayro-accent/60 hover:text-vayro-text'
            }`}
          >
            <Icon name="store" size={18} /> إدارة المتجر
          </Link>
        )}
      </nav>
      <div className="mt-10 border-t border-vayro-border pt-4">
        {user && (
          <p className="mb-3 flex items-center gap-2 text-xs text-vayro-muted">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-vayro-primary text-[11px] font-bold uppercase text-white">
              {user.username.slice(0, 1)}
            </span>
            <span dir="ltr">@{user.username}</span>
          </p>
        )}
        <button onClick={onLogout} className="text-xs text-vayro-danger transition hover:underline">
          تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-l border-vayro-border bg-vayro-surface p-6 md:block">
        {SidebarBody}
      </aside>

      {/* موبايل: شريط علوي + درج */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-vayro-border bg-vayro-bg px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2"><LogoMark height={28} /><Wordmark height={14} /></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle className="!h-9 !w-9" />
          <button onClick={() => setDrawer(true)} aria-label="القائمة" className="grid h-9 w-9 place-items-center rounded-full border border-vayro-border"><Icon name="menu" size={18} /></button>
        </div>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 end-0 w-72 animate-fade-in overflow-y-auto border-s border-vayro-border bg-vayro-surface p-6">
            <button onClick={() => setDrawer(false)} aria-label="إغلاق" className="absolute start-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-vayro-border"><Icon name="close" size={16} /></button>
            {SidebarBody}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 p-6 pt-20 md:p-10">
        <div className="mb-6 hidden justify-end md:flex"><ThemeToggle /></div>
        {children}
      </main>
    </div>
  );
}
