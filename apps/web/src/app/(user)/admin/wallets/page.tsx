'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Notice, PageHeader, Pill } from '@/components/ui/PageHeader';

interface Wallet {
  user: { publicId: string; username: string; email: string; phone: string; shamcashAddress: string; status: string };
  balances: { assetCode: string; available: string; held: string; ledger: string; consistent: boolean }[];
  recentTransactions: { id: string; type: string; status: string; createdAt: string }[];
}
interface Recon {
  ok: boolean;
  walletVsLedger: unknown[];
  unbalancedTransactions: unknown[];
  assetTotalsNotZero: unknown[];
  negativeBalances: unknown[];
  stuckWithdrawals: number;
  stuckOrders: number;
  checkedAt: string;
}

export default function AdminWalletsPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ publicId: string; username: string; email: string }[] | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!accessToken || !q.trim()) return;
    const r = await apiFetch<{ users: { publicId: string; username: string; email: string }[] }>(`/admin/users?search=${encodeURIComponent(q.trim())}&limit=10`, { accessToken });
    if (r.success && r.data) setFound(r.data.users);
    else toast(r.error?.message ?? 'تعذّر البحث', 'error');
  }
  async function open(publicId: string) {
    const r = await apiFetch<Wallet>(`/admin/ops/wallets/${publicId}`, { accessToken });
    if (r.success && r.data) { setWallet(r.data); setFound(null); } else toast(r.error?.message ?? 'تعذّر التحميل', 'error');
  }
  async function reconcile() {
    setBusy(true);
    const r = await apiFetch<Recon>('/admin/ops/reconcile', { accessToken });
    setBusy(false);
    if (r.success && r.data) setRecon(r.data); else toast(r.error?.message ?? 'تعذّر الفحص', 'error');
  }

  return (
    <div className="max-w-4xl">
      <PageHeader icon="chart" title="المحافظ والتسوية" sub="ابحث عن مستخدم لعرض رصيده ومطابقته مع الدفتر، أو شغّل فحص التسوية الشامل للنظام." />

      <section className="hud mb-8 p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">فحص التسوية الشامل</h3>
        <Button onClick={reconcile} loading={busy}>تشغيل الفحص</Button>
        {recon && (
          <div className="mt-5 space-y-2 text-sm">
            <Notice tone={recon.ok ? 'success' : 'danger'}>{recon.ok ? 'كل الفحوص سليمة.' : 'يوجد ما يستحق المراجعة أدناه.'}</Notice>
            <p>أرصدة المحافظ ≠ الدفتر: <b>{recon.walletVsLedger.length}</b></p>
            <p>عمليات غير متوازنة (قيد مزدوج): <b>{recon.unbalancedTransactions.length}</b> <span className="text-xs text-vayro-muted">(العمليات القديمة قبل القيد المقابل تظهر هنا)</span></p>
            <p>أصول مجموعها ≠ 0: <b>{recon.assetTotalsNotZero.length}</b></p>
            <p>أرصدة سالبة: <b>{recon.negativeBalances.length}</b></p>
            <p>سحوبات عالقة: <b>{recon.stuckWithdrawals}</b> — طلبات متجر عالقة: <b>{recon.stuckOrders}</b></p>
            {!recon.ok && <pre className="max-h-64 overflow-auto rounded-lg border border-vayro-border bg-vayro-surface p-3 text-xs" dir="ltr">{JSON.stringify(recon, null, 2)}</pre>}
          </div>
        )}
      </section>

      <section className="hud p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">محفظة مستخدم</h3>
        <form className="flex gap-3" noValidate onSubmit={(e) => { e.preventDefault(); search(); }}>
          <Field label="اسم المستخدم أو البريد" value={q} onChange={(e) => setQ(e.target.value)} ltr className="flex-1" />
          <Button type="submit" className="self-end">بحث</Button>
        </form>
        {found && (
          <ul className="mt-4 space-y-2">
            {found.length === 0 && <li className="text-sm text-vayro-muted">لا نتائج.</li>}
            {found.map((u) => (
              <li key={u.publicId}>
                <button onClick={() => open(u.publicId)} className="w-full rounded-lg border border-vayro-border p-3 text-start text-sm transition hover:border-vayro-primary" dir="ltr">@{u.username} · {u.email}</button>
              </li>
            ))}
          </ul>
        )}
        {wallet && (
          <div className="mt-6">
            <p className="mb-1 text-sm" dir="ltr">@{wallet.user.username} · {wallet.user.email}</p>
            <p className="mb-4 text-xs text-vayro-muted" dir="ltr">phone {wallet.user.phone} · sham {wallet.user.shamcashAddress} · {wallet.user.status}</p>
            <div className="space-y-2">
              {wallet.balances.length === 0 && <p className="text-sm text-vayro-muted">لا توجد أرصدة.</p>}
              {wallet.balances.map((b) => (
                <div key={b.assetCode} className="flex items-center justify-between gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-4">
                  <span className="font-mono text-sm" dir="ltr">{b.assetCode}: {b.available} <span className="text-vayro-muted">(محجوز {b.held}, دفتر {b.ledger})</span></span>
                  <Pill tone={b.consistent ? 'success' : 'danger'}>{b.consistent ? 'متطابق' : 'غير متطابق'}</Pill>
                </div>
              ))}
            </div>
            <h4 className="mb-2 mt-6 text-sm font-semibold">آخر العمليات</h4>
            <div className="space-y-1 text-xs text-vayro-muted" dir="ltr">
              {wallet.recentTransactions.map((t) => <p key={t.id}>{new Date(t.createdAt).toLocaleString()} · {t.type} · {t.status} · {t.id}</p>)}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
