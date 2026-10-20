'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useKyc } from '@/lib/kyc';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { Card, KycPill, Notice, PageHeader, PageShell, Skeleton } from '@/components/ui/PageHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const DOCS = [
  { value: 'ID_CARD', label: 'هوية شخصية' },
  { value: 'PASSPORT', label: 'جواز سفر' },
  { value: 'DRIVING_LICENSE', label: 'رخصة قيادة' },
];

function FilePick({ label, hint, file, onFile, error }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void; error?: string }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div>
      <p className="mb-1.5 text-sm text-vayro-muted">{label}</p>
      <label className={`group relative flex h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl2 border border-dashed bg-vayro-surface text-center text-xs text-vayro-muted transition hover:border-vayro-primary ${error ? 'border-vayro-danger' : 'border-vayro-border'}`}>
        {url ? (
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <Icon name="upload-cloud" size={28} className="transition group-hover:-translate-y-1" />
            <span>{hint}</span>
          </>
        )}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="mt-1.5 text-xs text-vayro-danger">{error}</p>}
    </div>
  );
}

export default function KycPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { kyc, reload } = useKyc();
  const [fullName, setFullName] = useState('');
  const [docType, setDocType] = useState('ID_CARD');
  const [docNumber, setDocNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (fullName.trim().length < 5) err.fullName = 'اكتب اسمك الكامل كما في الوثيقة';
    if (!/^[A-Za-z0-9\-/ ]{4,32}$/.test(docNumber.trim())) err.docNumber = 'رقم الوثيقة غير صالح';
    if (!front) err.front = 'صورة الوجه الأمامي مطلوبة';
    if (docType !== 'PASSPORT' && !back) err.back = 'صورة الوجه الخلفي مطلوبة';
    if (!selfie) err.selfie = 'صورة السيلفي مطلوبة';
    for (const [k, f] of [['front', front], ['back', back], ['selfie', selfie]] as const) if (f && f.size > 5 * 1024 * 1024) err[k] = 'الحد الأقصى 5MB';
    setErrors(err);
    setFormError(null);
    if (Object.keys(err).length || !accessToken) return;

    const fd = new FormData();
    fd.append('fullName', fullName.trim());
    fd.append('docType', docType);
    fd.append('docNumber', docNumber.trim());
    fd.append('front', front!);
    if (docType !== 'PASSPORT' && back) fd.append('back', back);
    fd.append('selfie', selfie!);
    setBusy(true);
    try {
      // بدون Content-Type: المتصفح يضيف boundary بنفسه
      const res = await fetch(`${API_URL}/kyc/submit`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${accessToken}` }, body: fd });
      const j = await res.json();
      if (!j.success) {
        const m = Array.isArray(j.error?.message) ? j.error.message.join('، ') : j.error?.message;
        setFormError(m ?? 'تعذّر إرسال الطلب');
      } else {
        toast('تم إرسال طلب التوثيق. سنراجعه قريباً.', 'success');
        setFront(null); setBack(null); setSelfie(null); setDocNumber('');
        await reload();
      }
    } catch {
      setFormError('تعذّر الاتصال بالسيرفر');
    }
    setBusy(false);
  }

  return (
    <PageShell>
      <PageHeader icon="shield-check" title="توثيق الهوية" sub="خطوة إلزامية لتفعيل بعض الخدمات. صورك تُحفظ بشكل خاص ولا يراها إلا فريق المراجعة." action={kyc && <KycPill status={kyc.status} />} />

      {kyc === null ? (
        <Skeleton />
      ) : kyc.status === 'APPROVED' ? (
        <Notice tone="success">هويتك موثّقة. جميع الخدمات متاحة لك.</Notice>
      ) : kyc.status === 'PENDING' ? (
        <Notice tone="info" icon="hourglass">طلبك قيد المراجعة. سيظهر القرار هنا فور صدوره.</Notice>
      ) : (
        <>
          {kyc.status === 'REJECTED' && <Notice tone="danger">تم رفض طلبك السابق{kyc.note ? `: ${kyc.note}` : '.'} أصلح الملاحظة وأعد الإرسال.</Notice>}
          <Card>
            <form onSubmit={submit} noValidate className="space-y-4">
              <Field label="الاسم الكامل (كما في الوثيقة)" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="نوع الوثيقة" value={docType} onChange={setDocType} options={DOCS} />
                <Field label="رقم الوثيقة" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} ltr error={errors.docNumber} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FilePick label="الوجه الأمامي" hint="اختر صورة" file={front} onFile={setFront} error={errors.front} />
                {docType !== 'PASSPORT' && <FilePick label="الوجه الخلفي" hint="اختر صورة" file={back} onFile={setBack} error={errors.back} />}
                <FilePick label="سيلفي مع الوثيقة" hint="اختر صورة" file={selfie} onFile={setSelfie} error={errors.selfie} />
              </div>
              <p className="text-xs leading-6 text-vayro-muted">PNG أو JPG أو WEBP، حتى 5MB لكل صورة. تأكد أن النص واضح وغير مقصوص.</p>
              {formError && <Notice tone="danger">{formError}</Notice>}
              <Button type="submit" size="lg" loading={busy} className="w-full">إرسال للمراجعة</Button>
            </form>
          </Card>
        </>
      )}
    </PageShell>
  );
}
