'use client';

import { useState } from 'react';
import { AuthCard, SubmitButton, TextField } from '@/components/auth-card';
import { apiFetch } from '@/lib/api-client';
import { t } from '@/i18n';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    await apiFetch('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email') }),
    });
    setLoading(false);
    // Always show the same success state, whether or not the account exists.
    setSent(true);
  }

  return (
    <AuthCard title={t('auth.forgot.title')}>
      {sent ? (
        <p className="text-center text-sm text-vayro-muted">
          إذا كان البريد الإلكتروني مسجلاً لدينا، ستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <TextField label="البريد الإلكتروني" name="email" type="email" required />
          <SubmitButton>{loading ? '...' : t('auth.forgot.submit')}</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
