import { SiteShell } from '@/components/layout/SiteShell';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
