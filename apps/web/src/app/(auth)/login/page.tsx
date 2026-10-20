'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { mediaUrl } from '@/lib/media';
import { useSiteSettings } from '@/lib/site-content';
import { LogoMark } from '@/components/brand/Logo';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useDialog } from '@/components/ui/DialogProvider';

export default function LoginPage() {
  const router = useRouter();
  const { login, accessToken, isLoading } = useAuth();
  useEffect(() => { if (!isLoading && accessToken) router.replace('/dashboard'); }, [isLoading, accessToken, router]);
  const dlg = useDialog();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const site = useSiteSettings();
  const bg = site?.['login.images']?.images ?? [];
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (bg.length < 2) return;
    const t = setInterval(() => setSlide((i) => (i + 1) % bg.length), 6000);
    return () => clearInterval(t);
  }, [bg.length]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err: typeof errors = {};
    if (!identifier.trim()) err.identifier = 'اكتب اسم المستخدم أو البريد';
    if (!password) err.password = 'اكتب كلمة السر';
    setErrors(err);
    if (Object.keys(err).length) return;

    setBusy(true);
    const res = await apiFetch<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername: identifier.trim(), password }),
    });
    if (!res.success || !res.data) {
      setBusy(false);
      await dlg.alert({ title: 'تعذّر تسجيل الدخول', message: res.error?.message ?? 'بيانات الدخول غير صحيحة.', tone: 'danger' });
      return;
    }
    await login(res.data.accessToken);
    router.push('/dashboard');
  }

  return (
    <section className="relative overflow-hidden">
      {bg.length > 0 ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {bg.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={mediaUrl(u)} alt="" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === slide % bg.length ? 'opacity-100' : 'opacity-0'}`} />
          ))}
          <div className="absolute inset-0 bg-vayro-bg/75" />
        </div>
      ) : null}
      <div className="relative mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-16">
        <form onSubmit={onSubmit} noValidate className="hud w-full space-y-4 p-8">
          <div className="mb-2 text-center">
            <LogoMark height={78} className="mx-auto mb-3 bob" />
            <h1 className="font-display text-2xl font-bold">تسجيل الدخول</h1>
          </div>
          <Field label="اسم المستخدم أو البريد" value={identifier} onChange={(e) => setIdentifier(e.target.value)} error={errors.identifier} ltr autoComplete="username" />
          <Field label="كلمة السر" type="password" reveal value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} ltr autoComplete="current-password" />
          <Button type="submit" size="lg" loading={busy} className="w-full">
            دخول
          </Button>
          <p className="text-center text-sm text-vayro-muted">
            ما عندك حساب؟{' '}
            <Link href="/register#form" className="font-semibold text-vayro-accent hover:underline">
              أنشئ حساباً
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
