'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/** يحوّل المستخدم المسجَّل دخوله إلى لوحته بدل إظهار صفحات الدخول/التسجيل. */
export function AuthRedirect() {
  const router = useRouter();
  const { accessToken, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading && accessToken) router.replace('/dashboard');
  }, [isLoading, accessToken, router]);
  return null;
}
