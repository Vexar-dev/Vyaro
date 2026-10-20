'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useKyc } from '@/lib/kyc';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button, LinkButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { Card, EmptyState, KycPill, Notice, PageHeader, PageShell, SectionTitle, Skeleton } from '@/components/ui/PageHeader';

interface Balance { assetCode: string; assetName: string; available: string; held: string }
interface TransferListItem {
  transactionId: string;
  status: string;
  direction: 'SENT' | 'RECEIVED';
  counterpartyUsername: string | null;
  assetCode: string | null;
  amount: string | null;
  note: string | null;
  createdAt: string;
}

const QUICK = [
  { href: '/deposit', label: 'إيداع', icon: 'download' },
  { href: '/withdraw', label: 'سحب', icon: 'upload' },
  { href: '/store', label: 'المتجر', icon: 'cart' },
  { href: '/kyc', label: 'توثيق الهوية', icon: 'shield-check' },
];

export default function DashboardPage() {
  const { accessToken, user } = useAuth();
  const toast = useToast();
  const { kyc } = useKyc();
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [transfers, setTransfers] = useState<TransferListItem[] | null>(null);

  const [toUsername, setToUsername] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ to?: string; asset?: string; amount?: string; form?: string }>({});
  const [needKyc, setNeedKyc] = useState(false);
  // يبقى ثابتاً عبر إعادة محاولة نفس العملية، ويتجدد بعد النجاح فقط.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  const loadWallet = useCallback(async () => {
    if (!accessToken) return;
    const res = await apiFetch<Balance[]>('/wallet/me', { accessToken });
    if (res.success && res.data) {
      setBalances(res.data);
      setAssetCode((cur) => cur || res.data?.[0]?.assetCode || '');
    } else setBalances([]);
  }, [accessToken]);

  const loadTransfers = useCallback(async () => {
    if (!accessToken) return;
    const res = await apiFetch<TransferListItem[]>('/transfers?limit=10', { accessToken });
    setTransfers(res.success && res.data ? res.data : []);
  }, [accessToken]);

  useEffect(() => {
    loadWallet();
    loadTransfers();
  }, [loadWallet, loadTransfers]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    const errs: typeof errors = {};
    if (!toUsername.trim()) errs.to = 'اكتب اسم المستلم';
    if (!assetCode) errs.asset = 'لا يوجد رصيد للإرسال منه';
    if (!/^\d+(\.\d+)?$/.test(amount.trim()) || Number(amount) <= 0) errs.amount = 'اكتب مبلغاً صحيحاً';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSending(true);
    setNeedKyc(false);
    const res = await apiFetch<{ toUsername: string; amount: string; assetCode: string }>('/transfers', {
      method: 'POST',
      accessToken,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ toUsername: toUsername.replace(/^@/, '').trim(), assetCode, amount: amount.trim(), ...(note ? { note } : {}) }),
    });
    setSending(false);

    if (!res.success || !res.data) {
      if (res.error?.code === 'KYC_REQUIRED') setNeedKyc(true);
      setErrors({ form: res.error?.message ?? 'تعذّر إتمام التحويل' });
      return;
    }
    toast(`تم إرسال ${res.data.amount} ${res.data.assetCode} إلى @${res.data.toUsername}`, 'success');
    setToUsername('');
    setAmount('');
    setNote('');
    setErrors({});
    setIdempotencyKey(crypto.randomUUID());
    await Promise.all([loadWallet(), loadTransfers()]);
  }

  const kycDone = kyc?.status === 'APPROVED';

  return (
    <PageShell>
      <PageHeader
        icon="home"
        title={user ? `أهلاً @${user.username}` : 'لوحتك'}
        sub="أرصدتك وآخر عملياتك في مكان واحد."
        action={kyc && <KycPill status={kyc.status} />}
      />

      {kyc && !kycDone && Object.values(kyc.requirements).some(Boolean) && (
        <Notice tone="info" icon="shield-check">
          {kyc.status === 'PENDING' ? 'طلب توثيق هويتك قيد المراجعة.' : kyc.status === 'REJECTED' ? 'تم رفض طلب التوثيق، راجع الملاحظة وأعد الإرسال.' : 'وثّق هويتك لتفعيل عناوين الإيداع والسحب.'}{' '}
          <Link href="/kyc" className="font-semibold underline underline-offset-4">
            {kyc.status === 'PENDING' ? 'عرض الحالة' : 'ابدأ التوثيق'}
          </Link>
        </Notice>
      )}

      <SectionTitle>الأرصدة</SectionTitle>
      {balances === null ? (
        <Skeleton rows={2} />
      ) : balances.length === 0 ? (
        <EmptyState icon="wallet" title="لا توجد أرصدة بعد" action={<LinkButton href="/deposit">اذهب للإيداع</LinkButton>}>
          ستظهر أرصدتك هنا بعد أول إيداع.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {balances.map((b, i) => (
            <Card key={b.assetCode} hover className="animate-rise" >
              <div style={{ animationDelay: `${i * 60}ms` }}>
                <p className="flex items-center gap-2 text-sm text-vayro-muted">
                  <Icon name="coin" size={16} />
                  {b.assetName || b.assetCode}
                </p>
                <p className="mt-2 font-mono text-3xl font-bold" dir="ltr">{b.available}</p>
                <p className="mt-1 text-xs text-vayro-muted" dir="ltr">{b.assetCode}{Number(b.held) > 0 ? `  ·  محجوز ${b.held}` : ''}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className="group flex flex-col items-center gap-2 rounded-xl2 border border-vayro-border bg-vayro-card px-3 py-4 text-sm transition hover:-translate-y-0.5 hover:border-vayro-primary/60">
            <Icon name={q.icon} size={22} className="text-vayro-primary transition group-hover:scale-110" />
            {q.label}
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <SectionTitle>إرسال إلى مستخدم</SectionTitle>
        <Card>
          <form onSubmit={onSend} noValidate className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="المستلم" value={toUsername} onChange={(e) => setToUsername(e.target.value)} placeholder="@username" ltr error={errors.to} />
              <div>
                <Select
                  label="العملة"
                  value={assetCode}
                  onChange={setAssetCode}
                  placeholder={balances === null ? 'جارِ التحميل...' : 'لا يوجد رصيد'}
                  disabled={!balances?.length}
                  options={(balances ?? []).map((b) => ({ value: b.assetCode, label: b.assetCode, hint: b.available }))}
                />
                {errors.asset && <p className="mt-1.5 text-xs text-vayro-danger">{errors.asset}</p>}
              </div>
              <Field label="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" ltr error={errors.amount} />
            </div>
            <Field label="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
            {errors.form && (
              <Notice tone="danger">
                {errors.form}{' '}
                {needKyc && <Link href="/kyc" className="font-semibold underline underline-offset-4">وثّق هويتك</Link>}
              </Notice>
            )}
            <Button type="submit" loading={sending} disabled={!balances?.length}>إرسال</Button>
          </form>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>آخر العمليات</SectionTitle>
        {transfers === null ? (
          <Skeleton rows={3} />
        ) : transfers.length === 0 ? (
          <EmptyState icon="swap" title="لا توجد عمليات بعد">ستظهر هنا تحويلاتك الصادرة والواردة.</EmptyState>
        ) : (
          <div className="space-y-2">
            {transfers.map((tr) => (
              <Card key={tr.transactionId} className="flex items-center justify-between !p-4">
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-full border border-vayro-border ${tr.direction === 'SENT' ? 'text-vayro-danger' : 'text-vayro-success'}`}>
                    <Icon name={tr.direction === 'SENT' ? 'arrow-up-right' : 'arrow-down-left'} size={16} />
                  </span>
                  <div>
                    <p className="text-sm">{tr.direction === 'SENT' ? 'إلى' : 'من'} @{tr.counterpartyUsername ?? '—'}</p>
                    <p className="text-xs text-vayro-muted">{new Date(tr.createdAt).toLocaleString('ar')}</p>
                  </div>
                </div>
                <p className={`font-mono ${tr.direction === 'SENT' ? 'text-vayro-danger' : 'text-vayro-success'}`} dir="ltr">
                  {tr.direction === 'SENT' ? '-' : '+'}{tr.amount} {tr.assetCode}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
