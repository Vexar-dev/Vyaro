'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { displayPhone, normalizePhone } from '@/lib/phone';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { useDialog } from '../ui/DialogProvider';
import { useToast } from '../ui/Toast';

type Errors = Partial<Record<'username' | 'email' | 'phone' | 'shamcash' | 'password' | 'confirm' | 'terms', string>>;

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
const S_LABEL = ['ضعيفة جداً', 'ضعيفة', 'مقبولة', 'قوية', 'قوية جداً'];
const S_COLOR = ['bg-vayro-danger', 'bg-vayro-danger', 'bg-amber-400', 'bg-vayro-success', 'bg-vayro-success'];

export function RegisterForm() {
  const router = useRouter();
  const dlg = useDialog();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shamcash, setShamcash] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const st = strength(password);

  function validate(): Errors {
    const e: Errors = {};
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(username.trim())) e.username = 'من 3 إلى 20 خانة: حروف إنجليزية وأرقام و _ و . فقط';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = 'اكتب بريداً إلكترونياً صحيحاً';
    if (!normalizePhone(phone)) e.phone = 'اكتب رقم هاتف صحيحاً، مثال: 0933123456';
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(shamcash.trim())) e.shamcash = 'اكتب عنوان حساب شام كاش كما يظهر في تطبيقك (6 خانات على الأقل، بدون مسافات)';
    if (password.length < 10) e.password = 'كلمة السر 10 خانات على الأقل';
    if (confirm !== password) e.confirm = 'كلمتا السر غير متطابقتين';
    if (!terms) e.terms = 'يجب الموافقة على الشروط للمتابعة';
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast('راجع الحقول المحدّدة بالأحمر', 'error');
      return;
    }
    const phoneE164 = normalizePhone(phone)!;

    // الرقم نهائي — نطلب تأكيداً صريحاً قبل إنشاء الحساب
    const sure = await dlg.confirm({
      title: 'تأكيد بيانات السحب',
      icon: 'lock',
      tone: 'danger',
      confirmText: 'البيانات صحيحة، أنشئ الحساب',
      cancelText: 'تعديل البيانات',
      message: (
        <div className="space-y-3">
          <p className="rounded-lg border border-vayro-border bg-vayro-surface p-3 text-center font-mono text-lg font-bold text-vayro-text" dir="ltr">
            {displayPhone(phoneE164)}
          </p>
          <p className="rounded-lg border border-vayro-border bg-vayro-surface p-3 text-center font-mono text-sm font-bold text-vayro-text" dir="ltr">
            {shamcash.trim()}
          </p>
          <p>
            الرقم وعنوان شام كاش أعلاه <strong className="text-vayro-text">نهائيان</strong>: هما الوجهتان الوحيدتان لأي سحب (Syriatel Cash للرقم، Sham Cash للعنوان)، ولا يمكن تغييرهما أبداً بعد إنشاء الحساب، لا منك ولا من الدعم.
          </p>
        </div>
      ),
    });
    if (!sure) return;

    setBusy(true);
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), email: email.trim(), phone: phoneE164, shamcashAddress: shamcash.trim(), password }),
    });
    setBusy(false);
    if (!res.success) {
      await dlg.alert({
        title: 'تعذّر إنشاء الحساب',
        message: res.error?.message ?? 'حدث خطأ غير متوقع. حاول مرة ثانية بعد قليل.',
        tone: 'danger',
      });
      return;
    }
    await dlg.alert({
      title: 'تم إنشاء حسابك',
      message: 'حسابك جاهز. سجّل الدخول للبدء.',
      icon: 'info',
      confirmText: 'الذهاب لتسجيل الدخول',
    });
    router.push('/login');
  }

  return (
    <form onSubmit={onSubmit} noValidate className="hud relative space-y-4 p-6 md:p-8" id="form" aria-label="إنشاء حساب">
      <div className="mb-2">
        <h2 className="text-2xl font-bold">إنشاء حساب جديد</h2>
        <p className="mt-1 text-sm text-vayro-muted">دقيقة واحدة، وتحصل على عناوين الإيداع والمتجر.</p>
      </div>

      <Field label="اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} ltr autoComplete="username" placeholder="your_name" />
      <Field label="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} ltr autoComplete="email" placeholder="you@example.com" />
      <Field
        label="رقم الهاتف (Syriatel Cash)"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        hint="رقم سيرياتيل الذي تريد السحب عليه. لا يمكن تغييره بعد التسجيل."
        ltr
        autoComplete="tel"
        placeholder="0933123456"
      />
      <Field
        label="عنوان حساب Sham Cash"
        value={shamcash}
        onChange={(e) => setShamcash(e.target.value)}
        error={errors.shamcash}
        hint="العنوان الذي تريد استلام سحوبات Sham Cash عليه. لا يمكن تغييره بعد التسجيل."
        ltr
        autoComplete="off"
        placeholder="your-shamcash-address"
      />
      <div>
        <Field label="كلمة السر" type="password" reveal value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} ltr autoComplete="new-password" />
        {password && (
          <div className="mt-2 flex items-center gap-3" aria-live="polite">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < st ? S_COLOR[st] : 'bg-vayro-border'}`} />
              ))}
            </div>
            <span className="text-xs text-vayro-muted">{S_LABEL[st]}</span>
          </div>
        )}
      </div>
      <Field label="تأكيد كلمة السر" type="password" reveal value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} ltr autoComplete="new-password" />

      <div>
        <button
          type="button"
          role="checkbox"
          aria-checked={terms}
          onClick={() => {
            setTerms((t) => !t);
            setErrors((x) => ({ ...x, terms: undefined }));
          }}
          className="flex items-start gap-3 text-start"
        >
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs transition ${
              terms ? 'border-vayro-accent bg-vayro-accent text-white' : errors.terms ? 'border-vayro-danger' : 'border-vayro-border bg-vayro-surface'
            }`}
          >
            {terms && <Icon name="check" size={12} />}
          </span>
          <span className="text-sm leading-6 text-vayro-muted">أوافق على شروط الاستخدام وسياسة الخصوصية، وأفهم أن إرسال الأموال على شبكة خاطئة قد يسبب خسارتها نهائياً.</span>
        </button>
        {errors.terms && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-vayro-danger">
            
            {errors.terms}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" loading={busy} className="w-full">
        إنشاء الحساب
      </Button>

      <p className="text-center text-sm text-vayro-muted">
        عندك حساب؟{' '}
        <Link href="/login" className="font-semibold text-vayro-accent hover:underline">
          سجّل الدخول
        </Link>
      </p>
    </form>
  );
}
