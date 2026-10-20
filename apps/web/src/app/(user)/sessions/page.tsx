'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';

interface SessionRow {
  publicId: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  expiresAt: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  async function load() {
    const res = await apiFetch<SessionRow[]>('/users/me/sessions');
    if (res.success && res.data) setSessions(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(publicId: string) {
    await apiFetch(`/users/me/sessions/${publicId}`, { method: 'DELETE' });
    load();
  }

  return (
    <PageShell><div>
      <PageHeader icon="devices" title="الجلسات النشطة" sub="الأجهزة المسجّلة بحسابك. أنهِ أي جلسة لا تعرفها." />
      {!sessions ? (
        <p className="text-vayro-muted">جارِ التحميل...</p>
      ) : sessions.length === 0 ? (
        <p className="text-vayro-muted">لا توجد جلسات نشطة أخرى.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.publicId}
              className="flex items-center justify-between hud !p-4"
            >
              <div>
                <p className="text-sm text-vayro-text">{s.deviceName ?? 'جهاز غير معروف'}</p>
                <p className="text-xs text-vayro-muted">{s.ipAddress ?? '—'}</p>
                <p className="text-xs text-vayro-muted">
                  آخر استخدام: {new Date(s.lastUsedAt).toLocaleString('ar')}
                </p>
              </div>
              <button
                onClick={() => revoke(s.publicId)}
                className="rounded-lg border border-vayro-danger/40 px-3 py-1.5 text-xs text-vayro-danger hover:bg-vayro-danger/10"
              >
                إنهاء الجلسة
              </button>
            </div>
          ))}
        </div>
      )}
    </div></PageShell>
  );
}
