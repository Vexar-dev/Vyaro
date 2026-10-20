'use client';

import { AdminShell } from '@/components/admin/AdminShell';

const TABS = [
  { href: '/store-admin/products', label: 'المنتجات والأسعار', icon: 'box' },
  { href: '/store-admin/categories', label: 'الأقسام', icon: 'box' },
  { href: '/store-admin/import', label: 'استيراد خدمات', icon: 'download' },
  { href: '/store-admin/suppliers', label: 'المزوّدون', icon: 'plug' },
];

export default function StoreAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell allow={['STORE_ADMIN', 'ADMIN', 'SUPER_ADMIN']} tabs={TABS}>{children}</AdminShell>;
}
