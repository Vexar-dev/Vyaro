'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LogoMark } from '@/components/brand/Logo';

export default function Home() {
  const router = useRouter();
  const { accessToken, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading) return;
    router.replace(accessToken ? '/dashboard' : '/register');
  }, [accessToken, isLoading, router]);
  return (
    <div className="grid min-h-screen place-items-center">
      <LogoMark height={80} className="animate-fade-in" />
    </div>
  );
}
