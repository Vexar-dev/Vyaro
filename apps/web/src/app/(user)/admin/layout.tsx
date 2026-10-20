'use client';

import { AdminShell } from '@/components/admin/AdminShell';

const TABS = [
  { href: '/admin/users', label: 'المستخدمون', icon: 'users' },
  { href: '/admin/kyc', label: 'توثيق الهوية', icon: 'shield-check' },
  { href: '/admin/wallets', label: 'المحافظ والتسوية', icon: 'chart' },
  { href: '/admin/stuck', label: 'عمليات عالقة', icon: 'hourglass' },
  { href: '/admin/content', label: 'الأخبار والعروض', icon: 'news' },
  { href: '/admin/settings', label: 'الإعدادات والصور', icon: 'settings' },
  { href: '/admin/rates', label: 'أسعار الصرف', icon: 'swap' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell allow={['ADMIN', 'SUPER_ADMIN']} tabs={TABS}>{children}</AdminShell>;
}
