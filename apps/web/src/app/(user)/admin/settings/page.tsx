'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';

type Settings = Record<string, any>;
const SOCIALS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'], ['x', 'X'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']] as const;
const LIMIT_ASSETS = ['VYR_SCS', 'VYR_SCD'];

export default function SettingsPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [social, setSocial] = useState<Record<string, string>>({});
  const [ann, setAnn] = useState({ enabled: false, text: '' });
  const [limits, setLimits] = useState<Record<string, { min: string; max: string; dailyMax: string }>>({});
  const [margin, setMargin] = useState({ type: 'PERCENT', value: '10' });
  const [kycReq, setKycReq] = useState({ depositAddresses: false, withdrawals: false, shamcashWithdrawals: false, store: false, transfers: false });
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await apiFetch<Settings>('/admin/ops/settings', { accessToken: accessToken! });
    if (!r.success || !r.data) return;
    const d = r.data;
    setS(d);
    setImages(d['login.images']?.images ?? []);
    setSocial(d['site.social'] ?? {});
    setAnn({ enabled: !!d['site.announcement']?.enabled, text: d['site.announcement']?.text ?? '' });
    const l: Record<string, { min: string; max: string; dailyMax: string }> = {};
    for (const a of LIMIT_ASSETS) l[a] = { min: '', max: '', dailyMax: '', ...(d['withdraw.limits']?.[a] ?? {}) };
    setLimits(l);
    if (d['kyc.requirements']) setKycReq((k) => ({ ...k, ...d['kyc.requirements'] }));
    if (d['store.defaultMargin']) setMargin({ type: d['store.defaultMargin'].type, value: String(d['store.defaultMargin'].value) });
  }, [accessToken]);
  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  async function put(key: string, value: unknown, label: string) {
    setBusy(key);
    const r = await apiFetch(`/admin/ops/settings/${key}`, { method: 'PUT', accessToken: accessToken!, body: JSON.stringify({ value }) });
    setBusy('');
    if (r.success) toast(`تم حفظ ${label}`, 'success'); else toast(r.error?.message ?? 'تعذّر الحفظ', 'error');
  }
  function saveLimits() {
    const out: Record<string, Record<string, string>> = {};
    for (const [a, v] of Object.entries(limits)) {
      const o: Record<string, string> = {};
      for (const k of ['min', 'max', 'dailyMax'] as const) if (v[k].trim()) o[k] = v[k].trim();
      if (Object.keys(o).length) out[a] = o;
    }
    put('withdraw.limits', out, 'حدود السحب');
  }
  function saveSocial() {
    const out: Record<string, string> = {};
    for (const [k] of SOCIALS) out[k] = (social[k] ?? '').trim();
    put('site.social', out, 'روابط التواصل');
  }

  if (!s) return <p className="text-sm text-vayro-muted">جارِ التحميل…</p>;
  const card = 'hud mb-6 space-y-4 p-6';
  return (
    <div className="max-w-3xl">
      <PageHeader icon="settings" title="إعدادات الموقع" sub="صور صفحة الدخول، روابط التواصل، الشريط الإعلاني، حدود السحب، والهامش الافتراضي." />

      <section className={card}>
        <h3 className="font-display text-lg font-semibold">صور صفحة الدخول (حتى 10)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {images.map((u, i) => <ImageUpload key={u} label={`صورة ${i + 1}`} value={u} onChange={(n) => setImages(images.flatMap((x, j) => (j === i ? (n ? [n] : []) : [x])))} />)}
        </div>
        {images.length < 10 && <ImageUpload key={`new${images.length}`} label="إضافة صورة" value={null} onChange={(n) => n && setImages([...images, n])} />}
        <Button loading={busy === 'login.images'} onClick={() => put('login.images', { images }, 'صور الدخول')}>حفظ الصور</Button>
      </section>

      <section className={card}>
        <h3 className="font-display text-lg font-semibold">متطلبات توثيق الهوية</h3>
        <p className="text-xs text-vayro-muted">متوقف افتراضياً. فعّله للعمليات التي تريد ربطها بتوثيق الهوية.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['depositAddresses', 'توليد عناوين الإيداع'], ['shamcashWithdrawals', 'السحب عبر Sham Cash (للحماية من النصب والملاحقة)'], ['withdrawals', 'كل عمليات السحب'], ['store', 'الشراء من المتجر'], ['transfers', 'التحويل بين المستخدمين']] as const).map(([k, n]) => (
            <Select key={k} label={n} value={kycReq[k] ? '1' : '0'} onChange={(v) => setKycReq({ ...kycReq, [k]: v === '1' })} options={[{ value: '1', label: 'مفعّل: يتطلب توثيق' }, { value: '0', label: 'متوقف: لا يتطلب' }]} />
          ))}
        </div>
        <Button loading={busy === 'kyc.requirements'} onClick={() => put('kyc.requirements', kycReq, 'متطلبات التوثيق')}>حفظ</Button>
      </section>

      <section className={card}>
        <h3 className="font-display text-lg font-semibold">روابط التواصل</h3>
        <p className="text-xs text-vayro-muted">رابط يبدأ بـ https:// — اتركه فارغاً لإخفاء الأيقونة.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIALS.map(([k, n]) => <Field key={k} label={n} ltr value={social[k] ?? ''} onChange={(e) => setSocial({ ...social, [k]: e.target.value })} />)}
        </div>
        <Button loading={busy === 'site.social'} onClick={saveSocial}>حفظ الروابط</Button>
      </section>

      <section className={card}>
        <h3 className="font-display text-lg font-semibold">الشريط الإعلاني</h3>
        <Select label="الحالة" value={ann.enabled ? '1' : '0'} onChange={(v) => setAnn({ ...ann, enabled: v === '1' })} options={[{ value: '1', label: 'ظاهر' }, { value: '0', label: 'مخفي' }]} />
        <Field label="النص (حتى 300 حرف)" value={ann.text} maxLength={300} onChange={(e) => setAnn({ ...ann, text: e.target.value })} />
        <Button loading={busy === 'site.announcement'} onClick={() => put('site.announcement', ann, 'الشريط')}>حفظ</Button>
      </section>

      <section className={card}>
        <h3 className="font-display text-lg font-semibold">حدود السحب</h3>
        {Object.entries(limits).map(([a, v]) => (
          <div key={a} className="grid gap-3 sm:grid-cols-3">
            <Field label={`${a} — أدنى`} ltr value={v.min} onChange={(e) => setLimits({ ...limits, [a]: { ...v, min: e.target.value } })} />
            <Field label="أعلى للعملية" ltr value={v.max} onChange={(e) => setLimits({ ...limits, [a]: { ...v, max: e.target.value } })} />
            <Field label="أعلى يومياً" ltr value={v.dailyMax} onChange={(e) => setLimits({ ...limits, [a]: { ...v, dailyMax: e.target.value } })} />
          </div>
        ))}
        <Button loading={busy === 'withdraw.limits'} onClick={saveLimits}>حفظ الحدود</Button>
      </section>

      <section className={card}>
        <h3 className="font-display text-lg font-semibold">الهامش الافتراضي للمتجر</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="النوع" value={margin.type} onChange={(v) => setMargin({ ...margin, type: v })} options={[{ value: 'PERCENT', label: 'نسبة %' }, { value: 'FIXED', label: 'مبلغ ثابت' }]} />
          <Field label="القيمة" ltr value={margin.value} onChange={(e) => setMargin({ ...margin, value: e.target.value })} />
        </div>
        <Button loading={busy === 'store.defaultMargin'} onClick={() => put('store.defaultMargin', margin, 'الهامش')}>حفظ</Button>
      </section>
    </div>
  );
}
