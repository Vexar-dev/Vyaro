'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';

interface Profile {
  publicId: string;
  username: string;
  email: string;
  phone: string | null;
  status: string;
  fullName: string | null;
}

export default function ProfilePage() {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Profile>('/users/me', { accessToken }).then((res) => {
      if (res.success && res.data) {
        setProfile(res.data);
        setFullName(res.data.fullName ?? '');
      }
    });
  }, [accessToken]);

  async function save() {
    const res = await apiFetch<Profile>('/users/me', {
      method: 'PATCH',
      accessToken: accessToken ?? undefined,
      body: JSON.stringify({ fullName }),
    });
    if (res.success) setSavedAt(Date.now());
  }

  return (
    <PageShell><div>
      <PageHeader icon="id" title="الملف الشخصي" sub="بياناتك الأساسية كما سجّلتها." />
      {!profile ? (
        <p className="text-vayro-muted">جارِ التحميل...</p>
      ) : (
        <div className="space-y-4 hud p-5 md:p-6">
          <div>
            <p className="text-xs text-vayro-muted">اسم المستخدم</p>
            <p className="text-vayro-text">@{profile.username}</p>
          </div>
          <div>
            <p className="text-xs text-vayro-muted">البريد الإلكتروني</p>
            <p className="text-vayro-text">{profile.email}</p>
          </div>
          <label className="block text-sm text-vayro-muted">
            الاسم الكامل
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-vayro-text outline-none focus:border-vayro-primary"
            />
          </label>
          <button
            onClick={save}
            className="btn-glow rounded-lg px-5 py-2.5 text-sm font-semibold"
          >
            حفظ
          </button>
          {savedAt && <p className="text-xs text-vayro-success">تم الحفظ بنجاح</p>}
        </div>
      )}
    </div></PageShell>
  );
}
