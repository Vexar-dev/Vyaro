'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Pill, Skeleton } from '@/components/ui/PageHeader';

interface W { transactionId: string; username: string | null; providerCode: string | null; assetCode: string | null; amount: string | null; destination: Record<string, unknown> | null; ambiguous: boolean; createdAt: string }
interface O { orderId: string; username: string; product: string; provider: string; amount: string; assetCode: string; createdAt: string }

export default function StuckPage() {
  const { accessToken } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [w, setW] = useState<W[] | null>(null);
  const [o, setO] = useState<O[] | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const [a, b] = await Promise.all([
      apiFetch<W[]>('/admin/ops/withdrawals/stuck', { accessToken }),
      apiFetch<O[]>('/admin/ops/store-orders/stuck', { accessToken }),
    ]);
    setW(a.success && a.data ? a.data : []);
    setO(b.success && b.data ? b.data : []);
  }, [accessToken]);
  useEffect(() => { load(); }, [load]);

  async function resolve(kind: 'withdrawals' | 'store-orders', id: string, outcome: 'SUCCEEDED' | 'FAILED') {
    const succeeded = outcome === 'SUCCEEDED';
    const reason = await dlg.prompt({
      title: succeeded ? 'تأكيد: العملية نجحت لدى المزوّد' : 'تأكيد: العملية فشلت لدى المزوّد',
      message: succeeded
        ? 'سيتم خصم المبلغ نهائياً من رصيد المستخدم. تأكد من سجلّ المزوّد أولاً. اكتب كيف تحققت.'
        : 'سيُعاد المبلغ المحجوز لرصيد المستخدم. تأكد أن المزوّد لم ينفّذ العملية فعلاً. اكتب كيف تحققت.',
      icon: succeeded ? 'check' : 'arrow-left',
      tone: 'danger',
      confirmText: succeeded ? 'نجحت — اخصم' : 'فشلت — أعِد المبلغ',
    });
    if (!reason) return;
    const r = await apiFetch(`/admin/ops/${kind}/${id}/resolve`, { method: 'POST', accessToken: accessToken!, body: JSON.stringify({ outcome, reason }) });
    if (r.success) { toast('تم الحل', 'success'); load(); } else toast(r.error?.message ?? 'تعذّر الحل', 'error');
  }

  const Row = ({ title, sub, onOk, onFail, flag }: { title: string; sub: string; onOk: () => void; onFail: () => void; flag?: boolean }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-4">
      <div>
        <p className="text-sm" dir="ltr">{title} {flag && <Pill tone="danger">نتيجة غير مؤكدة</Pill>}</p>
        <p className="mt-0.5 text-xs text-vayro-muted" dir="ltr">{sub}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onOk} className="rounded-lg border border-vayro-success/50 px-3 py-1.5 text-xs text-vayro-success hover:bg-vayro-success/10">نجحت</button>
        <button onClick={onFail} className="rounded-lg border border-vayro-danger/50 px-3 py-1.5 text-xs text-vayro-danger hover:bg-vayro-danger/10">فشلت</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader icon="hourglass" title="عمليات عالقة" sub="سحوبات وطلبات بقيت قيد المعالجة أكثر من 10 دقائق (نتيجة غير مؤكدة من المزوّد أو توقّف السيرفر). تحقّق من سجلّ المزوّد نفسه قبل أي قرار — الأموال محجوزة بانتظارك." />
      <h3 className="mb-3 font-display text-lg font-semibold">سحوبات</h3>
      {w === null ? <Skeleton rows={2} /> : w.length === 0 ? <p className="text-sm text-vayro-muted">لا توجد سحوبات عالقة.</p> : (
        <div className="space-y-2">
          {w.map((x) => (
            <Row key={x.transactionId} flag={x.ambiguous} title={`@${x.username} · ${x.amount} ${x.assetCode} · ${x.providerCode}`} sub={`${x.transactionId} · ${new Date(x.createdAt).toLocaleString()} · ${JSON.stringify(x.destination)}`}
              onOk={() => resolve('withdrawals', x.transactionId, 'SUCCEEDED')} onFail={() => resolve('withdrawals', x.transactionId, 'FAILED')} />
          ))}
        </div>
      )}
      <h3 className="mb-3 mt-10 font-display text-lg font-semibold">طلبات المتجر</h3>
      {o === null ? <Skeleton rows={2} /> : o.length === 0 ? <p className="text-sm text-vayro-muted">لا توجد طلبات عالقة.</p> : (
        <div className="space-y-2">
          {o.map((x) => (
            <Row key={x.orderId} title={`@${x.username} · ${x.product} · ${x.amount} ${x.assetCode}`} sub={`${x.orderId} · ${x.provider} · ${new Date(x.createdAt).toLocaleString()}`}
              onOk={() => resolve('store-orders', x.orderId, 'SUCCEEDED')} onFail={() => resolve('store-orders', x.orderId, 'FAILED')} />
          ))}
        </div>
      )}
    </div>
  );
}
