'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Pill } from '@/components/ui/PageHeader';

interface Rate { from: string; to: string; rate: string; isActive: boolean; updatedAt: string }

export default function RatesPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [rates, setRates] = useState<Rate[]>([]);
  const [from, setFrom] = useState('USDT');
  const [to, setTo] = useState('VYR_SCS');
  const [rate, setRate] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch<Rate[]>('/admin/ops/rates', { accessToken: accessToken! });
    if (r.success && r.data) setRates(r.data);
  }, [accessToken]);
  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  async function save(next?: Partial<Rate> & { from: string; to: string; rate: string }) {
    const body = next ?? { from: from.toUpperCase(), to: to.toUpperCase(), rate, isActive: true };
    if (!/^\d{1,12}(\.\d{1,8})?$/.test(body.rate)) return setErr('اكتب رقماً صحيحاً (حتى 8 خانات عشرية)');
    setErr(null);
    const r = await apiFetch('/admin/ops/rates', { method: 'PUT', accessToken: accessToken!, body: JSON.stringify({ fromAssetCode: body.from, toAssetCode: body.to, rate: body.rate, isActive: body.isActive ?? true }) });
    if (r.success) { toast('تم الحفظ', 'success'); setRate(''); load(); } else toast(r.error?.message ?? 'تعذّر الحفظ', 'error');
  }

  return (
    <div className="max-w-2xl">
      <PageHeader icon="swap" title="أسعار الصرف" sub="السعر الذي يحوّل به المستخدم رصيده من عملة لأخرى (مثلاً USDT إلى VYR_SCS لسحب إيداعه عبر شام كاش). 1 من العملة الأولى = السعر × العملة الثانية. تُقرَّب النتيجة لأسفل دائماً." />
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="hud mb-8 grid gap-3 p-6 sm:grid-cols-3">
        <Field label="من" value={from} onChange={(e) => setFrom(e.target.value)} ltr />
        <Field label="إلى" value={to} onChange={(e) => setTo(e.target.value)} ltr />
        <Field label="السعر" value={rate} onChange={(e) => setRate(e.target.value)} ltr error={err} />
        <Button type="submit" className="sm:col-span-3">حفظ السعر</Button>
      </form>
      <div className="space-y-2">
        {rates.length === 0 && <p className="text-sm text-vayro-muted">لا توجد أسعار بعد — بدونها لا يستطيع المستخدمون التحويل بين العملات.</p>}
        {rates.map((r) => (
          <div key={`${r.from}${r.to}`} className="flex items-center justify-between gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-4">
            <span className="font-mono text-sm" dir="ltr">1 {r.from} = {r.rate} {r.to}</span>
            <div className="flex items-center gap-2">
              <Pill tone={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'فعّال' : 'موقوف'}</Pill>
              <button className="text-xs text-vayro-accent hover:underline" onClick={() => save({ from: r.from, to: r.to, rate: r.rate, isActive: !r.isActive })}>{r.isActive ? 'إيقاف' : 'تفعيل'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
