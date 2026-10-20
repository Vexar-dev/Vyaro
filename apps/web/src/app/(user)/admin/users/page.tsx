'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Select } from '@/components/ui/Select';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { Notice, PageHeader, Pill, Skeleton } from '@/components/ui/PageHeader';

interface AdminUser {
  publicId: string;
  username: string;
  email: string;
  status: string;
  roles: string[];
  createdAt: string;
}

// عزل اتجاه النص حتى لا ينقلب @username داخل جمل عربية
const iso = (s: string) => `\u2066${s}\u2069`;
const ALL_ROLES = ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'];
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد التفعيل',
  ACTIVE: 'نشط',
  FROZEN: 'مجمَّد',
  BANNED: 'محظور',
};

export default function AdminUsersPage() {
  const { accessToken, user: currentUser } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiFetch<{ users: AdminUser[] }>(`/admin/users?${params.toString()}`, { accessToken });
    if (res.success && res.data) {
      setUsers(res.data.users);
    } else {
      setError(res.error?.message ?? 'تعذّر تحميل المستخدمين — تأكد أنك تملك صلاحية users.view');
    }
  }, [accessToken, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(u: AdminUser, status: 'ACTIVE' | 'FROZEN' | 'BANNED') {
    if (!accessToken) return;

    // السبب بنافذة مصمَّمة (بدل window.prompt). الإلغاء = إيقاف العملية بالكامل.
    let reason: string | undefined;
    if (status !== 'ACTIVE') {
      const r = await dlg.prompt({
        title: `${status === 'BANNED' ? 'حظر' : 'تجميد'} ${iso('@' + u.username)}`,
        message: status === 'BANNED' ? 'سيُمنع هذا المستخدم من استخدام حسابه.' : 'سيتوقف نشاط هذا الحساب مؤقتاً حتى تعيد تفعيله.',
        label: 'سبب الإجراء (اختياري)',
        placeholder: 'مثال: نشاط مشبوه',
        optional: true,
        multiline: true,
        tone: 'danger',
        icon: status === 'BANNED' ? 'block' : 'lock',
        confirmText: status === 'BANNED' ? 'حظر الحساب' : 'تجميد الحساب',
      });
      if (r === null) return;
      reason = r || undefined;
    } else {
      const ok = await dlg.confirm({ title: `تفعيل ${iso('@' + u.username)}`, message: 'سيعود الحساب نشطاً ويستطيع صاحبه استخدامه.', icon: 'check', confirmText: 'تفعيل' });
      if (!ok) return;
    }

    setBusyId(u.publicId);
    const res = await apiFetch(`/admin/users/${u.publicId}/status`, {
      method: 'PATCH',
      accessToken,
      body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
    });
    setBusyId(null);
    if (!res.success) {
      setError(res.error?.message ?? 'فشل الإجراء');
      toast(res.error?.message ?? 'فشل الإجراء', 'error');
      return;
    }
    toast(`تم تحديث حالة ${iso('@' + u.username)}: ${STATUS_LABELS[status]}`, 'success');
    await load();
  }

  async function toggleRole(u: AdminUser, roleCode: string) {
    if (!accessToken) return;
    const has = u.roles.includes(roleCode);

    const ok = await dlg.confirm({
      title: has ? 'إزالة دور' : 'منح دور',
      message: `${has ? 'إزالة' : 'منح'} الدور ${iso(roleCode)} ${has ? 'من' : 'لـ'} ${iso('@' + u.username)}؟`,
      icon: 'crown',
      tone: roleCode === 'SUPPORT' ? 'default' : 'danger',
      confirmText: has ? 'إزالة' : 'منح',
    });
    if (!ok) return;

    setBusyId(u.publicId);
    const res = await apiFetch(
      has ? `/admin/users/${u.publicId}/roles/${roleCode}` : `/admin/users/${u.publicId}/roles`,
      {
        method: has ? 'DELETE' : 'POST',
        accessToken,
        ...(has ? {} : { body: JSON.stringify({ roleCode }) }),
      },
    );
    setBusyId(null);
    if (!res.success) {
      setError(res.error?.message ?? 'فشل تعديل الدور');
      toast(res.error?.message ?? 'فشل تعديل الدور', 'error');
      return;
    }
    toast('تم تعديل الدور', 'success');
    await load();
  }

  return (
    <div className="max-w-4xl">
      <PageHeader icon="crown" title="إدارة المستخدمين" sub="تجميد/حظر الحسابات وإدارة الأدوار. كل إجراء يطلب منك تأكيداً." />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="adm-search" className="sr-only">بحث</label>
          <input
            id="adm-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم المستخدم أو البريد..."
            className="w-full rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-sm text-vayro-text outline-none transition focus:border-vayro-primary"
          />
        </div>
        <Select
          className="w-48"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[{ value: '', label: 'كل الحالات' }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))]}
        />
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {users === null && !error ? (
        <Skeleton />
      ) : (
        <div className="space-y-3">
          {(users ?? []).map((u) => {
            const isSelf = currentUser?.publicId === u.publicId;
            return (
              <div key={u.publicId} className="hud p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-vayro-primary font-bold uppercase text-white">
                      {u.username.slice(0, 1)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-vayro-text">
                        <span dir="ltr">@{u.username}</span> <span className="font-normal text-vayro-muted" dir="ltr">— {u.email}</span>
                      </p>
                      <p className="mt-1 text-xs text-vayro-muted">
                        {u.roles.length ? u.roles.join(', ') : 'USER'} · {new Date(u.createdAt).toLocaleDateString('ar')}
                      </p>
                    </div>
                  </div>
                  <Pill tone={u.status === 'ACTIVE' ? 'success' : u.status === 'PENDING' ? 'muted' : 'danger'}>
                    {STATUS_LABELS[u.status] ?? u.status}
                  </Pill>
                </div>

                {!isSelf && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-vayro-border pt-3">
                    <span className="text-xs text-vayro-muted">الحالة:</span>
                    {(['ACTIVE', 'FROZEN', 'BANNED'] as const).map((s) => (
                      <button
                        key={s}
                        disabled={busyId === u.publicId || u.status === s}
                        onClick={() => setStatus(u, s)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40 ${
                          s === 'BANNED'
                            ? 'border-vayro-danger/40 text-vayro-danger hover:bg-vayro-danger/10'
                            : 'border-vayro-border text-vayro-text hover:border-vayro-primary hover:bg-vayro-primary/10'
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                    <span className="me-1 ms-3 text-xs text-vayro-muted">الأدوار:</span>
                    {ALL_ROLES.map((r) => (
                      <button
                        key={r}
                        disabled={busyId === u.publicId}
                        onClick={() => toggleRole(u, r)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40 ${
                          u.roles.includes(r)
                            ? 'border-vayro-primary bg-vayro-primary/20 text-vayro-text'
                            : 'border-vayro-border text-vayro-muted hover:border-vayro-primary/60 hover:text-vayro-text'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                {isSelf && <p className="mt-3 border-t border-vayro-border pt-3 text-xs text-vayro-muted">هذا حسابك — لا يمكنك تعديل حالتك أو أدوارك من هنا.</p>}
              </div>
            );
          })}
          {users !== null && users.length === 0 && (
            <p className="rounded-xl2 border border-dashed border-vayro-border p-8 text-center text-sm text-vayro-muted">لا يوجد مستخدمون مطابقون. غيّر البحث أو الفلتر.</p>
          )}
        </div>
      )}
    </div>
  );
}
