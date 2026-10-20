'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard, SubmitButton, TextField } from '@/components/auth-card';
import { apiFetch } from '@/lib/api-client';
import { t } from '@/i18n';

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await apiFetch<{ user: { roles: string[] } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername: form.get('identifier'), password: form.get('password') }),
    });
    if (!res.success) {
      setError(res.error?.message ?? 'حدث خطأ غير متوقع');
      return;
    }
    // Server-side RolesGuard is the real boundary — this client check only avoids a
    // confusing redirect; it grants no access by itself.
    const roles = res.data?.user.roles ?? [];
    if (!roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'SUPPORT')) {
      setError('هذا الحساب لا يملك صلاحية الوصول إلى لوحة التحكم');
      return;
    }
    router.push('/admin/dashboard');
  }

  return (
    <AuthCard title={t('admin.login.title')}>
      <form onSubmit={onSubmit}>
        <TextField label="اسم المستخدم أو البريد الإلكتروني" name="identifier" required />
        <TextField label="كلمة المرور" name="password" type="password" required />
        {error && <p className="mb-4 text-sm text-vayro-danger">{error}</p>}
        <SubmitButton>دخول</SubmitButton>
      </form>
    </AuthCard>
  );
}
