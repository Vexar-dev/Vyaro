'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { Card, Notice, PageHeader, PageShell } from '@/components/ui/PageHeader';
import { KycGate } from '@/components/ui/KycGate';
import { useKyc } from '@/lib/kyc';
import { looksSyriatel, normalizePhone } from '@/lib/phone';

interface Balance {
  assetCode: string;
  assetName: string;
  available: string;
}

type Provider = 'shamcash' | 'syriatel';
type Errs = Partial<Record<'amount' | 'assetCode' | 'destination', string>>;

// الأرصدة القابلة للسحب لكل مزوّد (يجب أن تطابق PAYOUT_ASSETS في withdrawals.service.ts)
const WITHDRAWABLE: Record<Provider, string[]> = { shamcash: ['VYR_SCS', 'VYR_SCD'], syriatel: ['VYR_SCS', 'SYRIATEL_CASH'] };
const PROVIDER_LABEL: Record<Provider, string> = { shamcash: 'Sham Cash', syriatel: 'Syriatel Cash' };

export default function WithdrawPage() {
  const { accessToken } = useAuth();
  const { kyc } = useKyc();
  const [needKyc, setNeedKyc] = useState(false);
  const [provider, setProvider] = useState<Provider>('shamcash');
  const gated = !!kyc && (kyc.requirements.withdrawals || (provider === 'shamcash' && kyc.requirements.shamcashWithdrawals)) && kyc.status !== 'APPROVED';
  const dlg = useDialog();
  const toast = useToast();
  const [balances, setBalances] = useState<Balance[] | null>(null);

  const [assetCode, setAssetCode] = useState('');
  const [amount, setAmount] = useState('');

  const [syriatelAction, setSyriatelAction] = useState<'transfer_cash' | 'mobile_recharge'>('transfer_cash');
  // الوجهة يكتبها المستخدم عند كل عملية: عنوان Sham Cash أو رقم Syriatel
  const [destination, setDestination] = useState('');

  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Errs>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadWallet = useCallback(async () => {
    if (!accessToken) return;
    const res = await apiFetch<Balance[]>('/wallet/me', { accessToken });
    if (res.success && res.data) {
      setBalances(res.data);
    }
  }, [accessToken]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // اختيار أول رصيد قابل للسحب لهذا المزوّد إن لم يكن المختار صالحاً
  useEffect(() => {
    const ok = (balances ?? []).filter((b) => WITHDRAWABLE[provider].includes(b.assetCode));
    if (!ok.some((b) => b.assetCode === assetCode)) setAssetCode(ok[0]?.assetCode ?? '');
  }, [balances, provider, assetCode]);

  function validate(): Errs {
    const e: Errs = {};
    if (!assetCode) e.assetCode = 'اختر الرصيد';
    if (provider === 'shamcash') {
      if (!/^[A-Za-z0-9_\-.:@]{4,128}$/.test(destination.trim())) e.destination = 'اكتب عنوان حساب Sham Cash بشكل صحيح';
    } else if (!normalizePhone(destination.trim())) e.destination = 'اكتب رقم Syriatel صحيحاً (09XXXXXXXX)';
    if (!/^\d+(\.\d+)?$/.test(amount.trim()) || Number(amount) <= 0) e.amount = 'اكتب مبلغاً صحيحاً أكبر من صفر';
    else {
      const bal = balances?.find((b) => b.assetCode === assetCode);
      if (bal && Number(amount) > Number(bal.available)) e.amount = `المبلغ أكبر من رصيدك المتاح (${bal.available})`;
    }
    return e;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accessToken) return;
    setResult(null);

    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('راجع الحقول المحدّدة بالأحمر', 'error');
      return;
    }

    // تأكيد مصمَّم بدل أي نافذة متصفح — يعرض المبلغ والوجهة قبل التنفيذ
    const destClean = destination.trim();
    const dest = provider === 'shamcash' ? destClean : `${syriatelAction === 'transfer_cash' ? 'تحويل كاش' : 'شحن رصيد'} إلى ${destClean}`;
    const ok = await dlg.confirm({
      title: 'تأكيد عملية السحب',
      icon: 'arrow-up-right',
      tone: 'danger',
      confirmText: 'نعم، نفّذ السحب',
      message: (
        <dl className="space-y-2 rounded-lg border border-vayro-border bg-vayro-surface p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-vayro-muted">المزوّد</dt><dd className="font-semibold text-vayro-text">{PROVIDER_LABEL[provider]}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-vayro-muted">المبلغ</dt><dd className="font-semibold text-vayro-text" dir="ltr">{amount.trim()} {assetCode}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-vayro-muted">الوجهة</dt><dd className="break-all text-end font-semibold text-vayro-text" dir="ltr">{dest}</dd></div>
          <p className="border-t border-vayro-border pt-3 text-xs text-vayro-danger">عمليات السحب لا يمكن التراجع عنها. تأكد من الوجهة قبل المتابعة.</p>
        </dl>
      ),
    });
    if (!ok) return;

    setSending(true);
    const res = await apiFetch<{ status: string; note: string | null }>('/withdrawals', {
      method: 'POST',
      accessToken,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ providerCode: provider, assetCode, amount, destination: destClean, ...(provider === 'syriatel' ? { action: syriatelAction } : {}) }),
    });

    setSending(false);
    setNeedKyc(res.error?.code === 'KYC_REQUIRED');
    if (!res.success || !res.data) {
      const message = res.error?.message ?? 'تعذّر إتمام السحب';
      setResult({ ok: false, message });
      toast(message, 'error');
      return;
    }

    const statusLabel =
      res.data.status === 'COMPLETED' ? 'تم السحب بنجاح' : res.data.note ?? `الحالة الحالية: ${res.data.status}`;
    setResult({ ok: res.data.status === 'COMPLETED', message: statusLabel });
    toast(statusLabel, res.data.status === 'COMPLETED' ? 'success' : 'info');
    setAmount('');
    setDestination('');
    setErrors({});
    await loadWallet();
  }

  return (
    <PageShell>
      <PageHeader icon="upload" title="سحب" sub="أرسل رصيدك إلى أي حساب Sham Cash أو Syriatel Cash. تكتب الوجهة هنا، وستظهر لك نافذة تأكيد قبل التنفيذ." />

      <Card>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Select
          label="المزوّد"
          value={provider}
          onChange={(v) => {
            setProvider(v as Provider);
            setAssetCode('');
            setDestination('');
            setErrors({});
          }}
          options={[
            { value: 'shamcash', label: 'Sham Cash' },
            { value: 'syriatel', label: 'Syriatel Cash' },
          ]}
        />

        {provider === 'syriatel' && (
          <Select
            label="نوع العملية"
            value={syriatelAction}
            onChange={(v) => setSyriatelAction(v as typeof syriatelAction)}
            options={[
              { value: 'transfer_cash', label: 'تحويل كاش' },
              { value: 'mobile_recharge', label: 'شحن رصيد موبايل' },
            ]}
          />
        )}

        <Field
          label={provider === 'shamcash' ? 'عنوان حساب Sham Cash المستلم' : 'رقم Syriatel المستلم'}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={provider === 'shamcash' ? 'عنوان الحساب' : '09XXXXXXXX'}
          inputMode={provider === 'shamcash' ? 'text' : 'tel'}
          ltr
          error={errors.destination}
          hint="راجع الوجهة جيداً: عمليات السحب لا يمكن التراجع عنها."
        />
        {provider === 'syriatel' && destination && normalizePhone(destination.trim()) && !looksSyriatel(normalizePhone(destination.trim()) as string) && (
          <p className="text-xs leading-6 text-vayro-danger">هذا الرقم لا يبدو رقم سيرياتيل (093 / 098 / 099). تأكد منه أو استخدم Sham Cash.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Select
              label="الرصيد"
              value={assetCode}
              onChange={setAssetCode}
              placeholder={balances === null ? 'جارِ التحميل...' : 'لا يوجد رصيد'}
              disabled={!balances?.some((b) => WITHDRAWABLE[provider].includes(b.assetCode))}
              options={(balances ?? []).filter((b) => WITHDRAWABLE[provider].includes(b.assetCode)).map((b) => ({ value: b.assetCode, label: b.assetCode, hint: b.available }))}
            />
            {errors.assetCode && <p className="mt-1.5 text-xs text-vayro-danger">{errors.assetCode}</p>}
          </div>
          <Field label="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" ltr error={errors.amount} />
        </div>

        {result && (
          <Notice tone={result.ok ? 'success' : 'danger'}>
            {result.message} {needKyc && <a href="/kyc" className="font-semibold underline underline-offset-4">وثّق هويتك</a>}
          </Notice>
        )}

        {gated ? (
          <KycGate status={kyc?.status} message={provider === 'shamcash' ? 'السحب عبر Sham Cash يتطلب توثيق هويتك لحماية الجميع من الاحتيال.' : undefined} />
        ) : (
          <Button type="submit" size="lg" loading={sending} disabled={!assetCode} className="w-full">
            {sending ? 'جارِ السحب...' : 'متابعة للتأكيد'}
          </Button>
        )}
      </form>
      </Card>
    </PageShell>
  );
}
