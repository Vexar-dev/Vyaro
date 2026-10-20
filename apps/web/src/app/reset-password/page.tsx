'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard, SubmitButton, TextField } from '@/components/auth-card';
import { apiFetch } from '@/lib/api-client';
import { t } from '@/i18n';

// useSearchParams() opts the whole tree into client-side rendering for the part that
// reads the URL, so Next.js requires it to sit below a <Suspense> boundary during
// static prerendering (App Router, Next 14) — otherwise `next build` fails on this
// route with "useSearchParams() should be wrapped in a suspense boundary". Splitting
// the token-reading logic into its own component keeps that requirement isolated
// instead of forcing the whole page to opt out of prerendering.
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const token = params.get('token') ?? '';
    const res = await apiFetch('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: form.get('newPassword') }),
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error?.message ?? 'الرابط غير صالح أو منتهي الصلاحية');
      return;
    }
    router.push('/login');
  }

  return (
    <AuthCard title={t('auth.reset.title')}>
      <form onSubmit={onSubmit}>
        <TextField
          label="كلمة المرور الجديدة"
          name="newPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
        {error && <p className="mb-4 text-sm text-vayro-danger">{error}</p>}
        <SubmitButton>{loading ? '...' : t('auth.reset.submit')}</SubmitButton>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title={t('auth.reset.title')}>
          <p className="text-sm text-vayro-muted">...جارِ التحميل</p>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
