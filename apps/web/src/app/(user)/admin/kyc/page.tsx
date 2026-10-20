'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { Card, EmptyState, KycPill, PageHeader, PageShell, Skeleton } from '@/components/ui/PageHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const DOC_LABEL: Record<string, string> = { ID_CARD: 'هوية شخصية', PASSPORT: 'جواز سفر', DRIVING_LICENSE: 'رخصة قيادة' };

interface Row { id: string; status: string; fullName: string; docType: string; docNumberLast4: string; username: string; email: string; phone: string | null; createdAt: string; reviewNote: string | null }
interface Detail extends Row { docNumber: string; hasBack: boolean }

/** الصور خاصة: تُجلب بترويسة Authorization وتُعرض كـ blob، ولا يوجد رابط عام لها. */
function SecureImg({ id, kind, token }: { id: string; kind: string; token: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let dead = false;
    fetch(`${API_URL}/admin/kyc/${id}/file/${kind}`, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (!dead) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => setErr(true));
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [id, kind, token]);
  const names: Record<string, string> = { front: 'الأمامي', back: 'الخلفي', selfie: 'السيلفي' };
  return (
    <figure>
      <figcaption className="mb-1 text-xs text-vayro-muted">{names[kind]}</figcaption>
      <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-vayro-border bg-vayro-surface text-xs text-vayro-muted">
        {src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="h-full w-full object-contain" /></a> : err ? 'تعذّر التحميل' : 'جارِ التحميل...'}
      </div>
    </figure>
  );
}

export default function AdminKycPage() {
  const { accessToken } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const r = await apiFetch<Row[]>(`/admin/kyc?status=${status}`, { accessToken: accessToken! });
    setRows(r.success && r.data ? r.data : []);
  }, [accessToken, status]);
  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  async function view(id: string) {
    const r = await apiFetch<Detail>(`/admin/kyc/${id}`, { accessToken: accessToken! });
    if (r.success && r.data) setOpen(r.data); else toast(r.error?.message ?? 'تعذّر الفتح', 'error');
  }

  async function review(outcome: 'APPROVED' | 'REJECTED') {
    if (!open) return;
    let note: string | undefined;
    if (outcome === 'REJECTED') {
      const n = await dlg.prompt({ title: 'سبب الرفض', message: 'سيظهر للمستخدم ليصلح ويعيد الإرسال.', icon: 'edit', confirmText: 'رفض الطلب' });
      if (!n) return;
      note = n.trim();
    } else {
      const ok = await dlg.confirm({ title: 'قبول التوثيق', message: `هل تطابقت بيانات ${open.fullName} مع الصور؟`, icon: 'shield-check', confirmText: 'قبول' });
      if (!ok) return;
    }
    setBusy(true);
    const r = await apiFetch(`/admin/kyc/${open.id}/review`, { method: 'POST', accessToken: accessToken!, body: JSON.stringify({ outcome, ...(note ? { note } : {}) }) });
    setBusy(false);
    if (r.success) { toast(outcome === 'APPROVED' ? 'تم قبول الطلب' : 'تم رفض الطلب', 'success'); setOpen(null); load(); }
    else toast(r.error?.message ?? 'تعذّر تنفيذ القرار', 'error');
  }

  return (
    <PageShell wide>
      <PageHeader icon="shield-check" title="توثيق الهوية" sub="راجع الصور وطابقها مع البيانات. كل فتح لصورة يُسجَّل في سجل التدقيق." />
      {open ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl">{open.fullName}</p>
              <p className="text-sm text-vayro-muted" dir="ltr">@{open.username} · {open.email}{open.phone ? ` · ${open.phone}` : ''}</p>
            </div>
            <KycPill status={open.status} />
          </div>
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between rounded-lg border border-vayro-border bg-vayro-surface px-3 py-2"><dt className="text-vayro-muted">نوع الوثيقة</dt><dd>{DOC_LABEL[open.docType] ?? open.docType}</dd></div>
            <div className="flex justify-between rounded-lg border border-vayro-border bg-vayro-surface px-3 py-2"><dt className="text-vayro-muted">رقم الوثيقة</dt><dd dir="ltr" className="font-mono">{open.docNumber}</dd></div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-3">
            <SecureImg id={open.id} kind="front" token={accessToken!} />
            {open.hasBack && <SecureImg id={open.id} kind="back" token={accessToken!} />}
            <SecureImg id={open.id} kind="selfie" token={accessToken!} />
          </div>
          {open.reviewNote && <p className="mt-3 text-sm text-vayro-muted">ملاحظة سابقة: {open.reviewNote}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {open.status === 'PENDING' && (
              <>
                <Button loading={busy} onClick={() => review('APPROVED')}>قبول</Button>
                <Button variant="danger" loading={busy} onClick={() => review('REJECTED')}>رفض</Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setOpen(null)}>رجوع للقائمة</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 max-w-xs">
            <Select label="الحالة" value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'قيد المراجعة' }, { value: 'APPROVED', label: 'مقبولة' }, { value: 'REJECTED', label: 'مرفوضة' }]} />
          </div>
          {rows === null ? <Skeleton /> : rows.length === 0 ? (
            <EmptyState icon="id" title="لا توجد طلبات">لا يوجد طلبات بهذه الحالة.</EmptyState>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <button key={r.id} onClick={() => view(r.id)} className="hud hud-hover flex w-full items-center justify-between gap-3 p-4 text-start">
                  <div>
                    <p className="font-semibold">{r.fullName}</p>
                    <p className="text-xs text-vayro-muted" dir="ltr">@{r.username} · {DOC_LABEL[r.docType] ?? r.docType} ····{r.docNumberLast4}</p>
                  </div>
                  <span className="text-xs text-vayro-muted">{new Date(r.createdAt).toLocaleString('ar')}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
