'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Notice } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';

export function AdminShell({ allow, tabs, children }: { allow: string[]; tabs: { href: string; label: string; icon: string }[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const path = usePathname();
  if (!user) return null;
  if (!user.roles?.some((r) => allow.includes(r))) {
    return <Notice tone="danger">ليست لديك صلاحية الدخول لهذه اللوحة.</Notice>;
  }
  return (
    <div>
      <nav className="mb-8 flex flex-wrap gap-2" aria-label="أقسام اللوحة">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={path === t.href ? 'page' : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              path === t.href ? 'border-vayro-accent bg-vayro-accent/20 text-vayro-text shadow-glow' : 'border-vayro-border text-vayro-muted hover:border-vayro-primary hover:text-vayro-text'
            }`}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export const TEXTAREA =
  'w-full rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-vayro-text outline-none transition placeholder:text-vayro-muted/60 hover:border-vayro-primary/50 focus:border-vayro-primary';
