'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';

export default function SecurityPage() {
  const [newUsername, setNewUsername] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function changeUsername(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await apiFetch('/users/me/username', {
      method: 'PATCH',
      body: JSON.stringify({ newUsername }),
    });
    if (res.success) {
      setMessage({ type: 'success', text: 'تم تغيير اسم المستخدم بنجاح' });
    } else {
      setMessage({ type: 'error', text: res.error?.message ?? 'تعذر تغيير اسم المستخدم' });
    }
  }

  return (
    <PageShell><div className="space-y-6">
      <PageHeader icon="shield" title="الأمان" sub="اسم المستخدم وكلمة السر وحماية الحساب." />

      <form onSubmit={changeUsername} className="hud p-5 md:p-6">
        <p className="mb-3 text-sm font-semibold">تغيير اسم المستخدم</p>
        <input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="username_new"
          className="mb-3 w-full rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-vayro-text outline-none focus:border-vayro-primary"
        />
        <p className="mb-3 text-xs text-vayro-muted">
          يمكن تغيير اسم المستخدم مرة واحدة كل 30 يومًا فقط.
        </p>
        <button className="btn-glow rounded-lg px-5 py-2.5 text-sm font-semibold">
          تحديث
        </button>
        {message && (
          <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-vayro-success' : 'text-vayro-danger'}`}>
            {message.text}
          </p>
        )}
      </form>

      <div className="hud p-5 md:p-6">
        <p className="mb-2 text-sm font-semibold">المصادقة الثنائية (2FA)</p>
        <p className="text-xs text-vayro-muted">
          البنية جاهزة لتفعيل TOTP — واجهة التفعيل ستُضاف عند ربطها بمعاملات مالية حساسة في مرحلة لاحقة.
        </p>
      </div>
    </div></PageShell>
  );
}
