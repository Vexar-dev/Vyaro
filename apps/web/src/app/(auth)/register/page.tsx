import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { KycArt, ShieldArt, StoreArt, WalletArt } from '@/components/brand/Illustrations';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { Faq } from '@/components/ui/Faq';
import { LinkButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { AuthRedirect } from '@/components/auth/AuthRedirect';

export const metadata: Metadata = { title: 'إنشاء حساب' };

const STEPS = [
  { icon: 'id', t: 'أنشئ حسابك', d: 'اسم مستخدم وبريد إلكتروني وكلمة سر قوية، وتنتهي الخطوة بدقيقة.' },
  { icon: 'eye', t: 'وثّق هويتك', d: 'خطوة تحمي حسابك وتفتح الخدمات التي تتطلب توثيقاً.' },
  { icon: 'link', t: 'خذ عناوينك', d: 'عنوان خاص بك على كل شبكة مدعومة: BEP-20 وTRC-20 وLitecoin.' },
  { icon: 'cart', t: 'استخدم رصيدك', d: 'اشترِ من المتجر الرقمي أو اسحب عبر Sham Cash وSyriatel Cash.' },
];

const WHY_KYC = [
  {
    icon: 'eye-off',
    t: 'حسابك مربوط بك أنت',
    d: 'التوثيق يثبت أن صاحب الحساب شخص حقيقي. إذا حاول أحد انتحال اسمك أو استعادة حسابك، تكون هويتك الموثّقة هي المرجع.',
  },
  {
    icon: 'warning',
    t: 'يغلق الباب على المحتالين',
    d: 'الحسابات الوهمية هي أداة الاحتيال الأولى. كل حساب موثّق يقلّل مساحة الاختباء للمحتالين على المنصة.',
  },
  {
    icon: 'key',
    t: 'يفتح الخدمات التي تتطلب توثيقاً',
    d: 'بعض العمليات الحسّاسة مثل السحب لا تتاح إلا لحساب أكمل خطوة التوثيق، حتى لا تمرّ بدون تحقق.',
  },
  {
    icon: 'file',
    t: 'إثبات عند الحاجة',
    d: 'لو حصل نزاع على عملية، وجود هوية موثّقة يسرّع التحقيق ويحفظ حقّك.',
  },
];

const SECURITY = [
  { icon: 'shield', t: 'جلستك لا تُخزَّن في المتصفح', d: 'رمز الدخول يبقى في ذاكرة الصفحة فقط ولا يُحفظ في التخزين المحلي، لتقليل ما يمكن سرقته عبر سكربت خبيث.' },
  { icon: 'lock', t: 'تجديد الجلسة بكوكي محمي', d: 'التجديد يتم عبر كوكي HttpOnly لا تستطيع أكواد الصفحة قراءته.' },
  { icon: 'refresh', t: 'حماية من التكرار', d: 'كل عملية سحب أو شراء تحمل مفتاحاً فريداً، فلو انقطع الاتصال وأعدت الإرسال لا تُنفَّذ العملية مرتين.' },
  { icon: 'shield-check', t: 'لا أحد يصل لبياناتك', d: 'كل طلب يخص حسابك يُربط بهويتك المسجَّلة في الجلسة، وليس بمعرّف يرسله المتصفح، فلا يمكن فتح بيانات حساب آخر.' },
  { icon: 'devices', t: 'تحكّم بأجهزتك', d: 'ترى كل الأجهزة المسجّلة بحسابك وتنهي أي جلسة لا تعرفها بضغطة.' },
  { icon: 'lock', t: 'تحقق بخطوتين', d: 'فعّل التحقق الثنائي من صفحة الأمان ليحتاج الدخول إلى رمز إضافي غير كلمة السر.' },
];

const FAQ = [
  { q: 'هل أستطيع استخدام نفس العنوان لكل الشبكات؟', a: 'لا. لكل شبكة عنوان مختلف (BEP-20 وTRC-20 وLitecoin). أرسل دائماً إلى العنوان المطابق للشبكة التي تستخدمها، لأن الإرسال على شبكة خاطئة قد يؤدي لفقدان المبلغ نهائياً.' },
  { q: 'كيف أسحب أموالي؟', a: 'من صفحة السحب تختار Sham Cash أو Syriatel Cash، وتدخل المبلغ والوجهة. كل عملية سحب تطلب منك تأكيداً قبل التنفيذ.' },
  { q: 'ماذا يوجد في المتجر؟', a: 'منتجات وخدمات رقمية تُشترى مباشرة من رصيدك. تظهر حالة كل طلب في صفحة المتجر تحت "طلباتي".' },
  { q: 'هل يطلب فريق VAYRO كلمة السر أو رمز PIN؟', a: 'أبداً. أي شخص يطلب منك كلمة السر أو رمز التحقق أو PIN باسم الدعم هو محتال، لا تعطه شيئاً وبلّغنا عنه.' },
  { q: 'نسيت أن أوثّق حسابي، هل أخسر شيئاً؟', a: 'لا تخسر شيئاً، لكن الخدمات التي تتطلب توثيقاً تبقى مغلقة حتى تكمله.' },
];

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <h2 className="text-3xl font-bold md:text-4xl">{title}</h2>
      {sub && <p className="mt-3 leading-8 text-vayro-muted">{sub}</p>}
      <div className="rune-divider mx-auto mt-6 w-40" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <>
      <AuthRedirect />
      {/* ───── الهيرو: العين + النموذج ───── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 md:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div>
            <div className="relative mb-8 inline-grid place-items-center">
              <LogoMark height={200} className="relative bob" />
            </div>
            <h1 className="text-4xl font-bold leading-[1.35] md:text-6xl md:leading-[1.3]">
              عنوان إيداع لكل شبكة
              <br />
              ومتجر رقمي، بحساب واحد.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-9 text-vayro-muted">
              VAYRO يعطيك عناوين استقبال خاصة بك للعملات الرقمية، ويخليك تصرف رصيدك في المتجر أو تسحبه مباشرة، من مكان واحد.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2.5 text-sm">
              {['USDT على BEP-20 وTRC-20', 'Litecoin (LTC)', 'سحب Sham Cash', 'سحب Syriatel Cash'].map((c) => (
                <li key={c} className="rounded-full border border-vayro-primary/40 bg-vayro-primary/10 px-4 py-1.5 text-vayro-text">
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <RegisterFormSlot />
        </div>
      </section>

      {/* ───── ما هو VAYRO ───── */}
      <section className="mx-auto max-w-6xl space-y-24 px-4 py-16 md:px-6" id="about">
        <SectionTitle title="مكان واحد للإيداع والمتجر" sub="بدل ما تنتقل بين محفظة ومتجر ومزوّد سحب، VAYRO يجمعهم بحساب واحد ورصيد واحد." />

        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-2xl">عناوين استقبال خاصة بك</h3>
            <p className="leading-8 text-vayro-muted">
              عند إنشاء حسابك تحصل على عنوان مستقل لكل شبكة مدعومة. انسخ العنوان، أرسل إليه من أي محفظة، ويظهر المبلغ في رصيدك بعد وصوله.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-vayro-muted">
              <li>عنوان لكل شبكة، لا يختلط عليك شيء</li>
              <li>نسخ بضغطة واحدة من صفحة الإيداع</li>
              <li>تنبيه واضح قبل أي إرسال على شبكة مختلفة</li>
            </ul>
          </div>
          <div className="hud p-4"><WalletArt className="w-full" /></div>
        </div>

        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="hud order-2 p-4 md:order-1"><StoreArt className="w-full" /></div>
          <div className="order-1 md:order-2">
            <h3 className="mb-3 text-2xl">متجر رقمي من رصيدك مباشرة</h3>
            <p className="leading-8 text-vayro-muted">
              اشترِ منتجات وخدمات رقمية من نفس الحساب بدون ما تحوّل أو تنتظر. كل طلب له حالة تتابعها لحظة بلحظة: قيد المعالجة، مكتمل، أو مُسترَد.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-vayro-muted">
              <li>الدفع من رصيدك في الموقع</li>
              <li>سجل بكل طلباتك وحالاتها</li>
              <li>تأكيد قبل الشراء حتى لا تضغط بالغلط</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ───── كيف تبدأ ───── */}
      <section className="border-y border-vayro-border bg-vayro-surface/50 py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionTitle title="أربع خطوات وتبدأ" />
          <ol className="relative grid gap-6 md:grid-cols-4">
            <div className="rune-divider absolute inset-x-10 top-7 hidden md:block" aria-hidden />
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative text-center">
                <div className="relative z-10 mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-vayro-accent/60 bg-vayro-card text-2xl">
                  <Icon name={s.icon} size={20} />
                  <span className="absolute -top-2 -end-2 grid h-6 w-6 place-items-center rounded-full bg-vayro-accent text-xs font-bold text-white">{i + 1}</span>
                </div>
                <h3 className="text-lg">{s.t}</h3>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-7 text-vayro-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───── ليش التوثيق ───── */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6" id="why-verify">
        <SectionTitle title="ليش لازم توثّق حسابك؟" sub="التوثيق ما هو إجراء شكلي. هو الفرق بين حساب يستطيع أي أحد ادّعاءه، وحساب يعرف الجميع أنه لك." />
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div className="hud sticky top-24 p-5"><KycArt className="w-full" /></div>
          <div className="grid gap-5 sm:grid-cols-2">
            {WHY_KYC.map((w, i) => (
              <article key={w.t} className={`hud hud-hover p-6 ${i % 2 ? 'sm:translate-y-6' : ''}`}>
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-vayro-primary/40 bg-vayro-primary/10 text-vayro-accent"><Icon name={w.icon} size={24} /></div>
                <h3 className="mb-2 text-lg">{w.t}</h3>
                <p className="text-sm leading-7 text-vayro-muted">{w.d}</p>
              </article>
            ))}
            <p className="rounded-xl2 border border-dashed border-vayro-primary/50 bg-vayro-primary/5 p-5 text-sm leading-7 text-vayro-muted sm:col-span-2 sm:mt-8">
              <strong className="text-vayro-text">وبياناتك؟</strong> وثائقك تُستخدم لغرض التحقق فقط. لا يراها أي مستخدم آخر ولا تظهر في ملفك العام.
            </p>
          </div>
        </div>
      </section>

      {/* ───── الحماية ───── */}
      <section className="relative overflow-hidden border-y border-vayro-border bg-vayro-surface/50 py-20" id="security">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionTitle title="كيف نحمي حسابك" sub="الحماية مبنية داخل طريقة عمل الموقع نفسها، مو إضافة في آخر الصفحة." />
          <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              {SECURITY.map((s) => (
                <div key={s.t} className="flex gap-4 rounded-xl2 border border-vayro-border bg-vayro-card/70 p-5 transition hover:border-vayro-accent/60">
                  <span className="text-vayro-accent" aria-hidden><Icon name={s.icon} size={24} /></span>
                  <div>
                    <h3 className="text-base">{s.t}</h3>
                    <p className="mt-1.5 text-sm leading-7 text-vayro-muted">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <ShieldArt className="mx-auto w-full max-w-md" />
          </div>

          <div className="mt-12 rounded-xl2 border border-vayro-danger/50 bg-vayro-danger/10 p-6">
            <h3 className="mb-3 flex items-center gap-2 text-xl text-vayro-danger">
              دورك في الحماية
            </h3>
            <ul className="grid gap-2 text-sm leading-7 sm:grid-cols-2">
              <li>• تأكد من اسم الشبكة قبل كل إرسال، لأن الخطأ لا يُسترجع.</li>
              <li>• لا تعطِ كلمة السر أو PIN لأي أحد، بما فيهم من يدّعي أنه من الدعم.</li>
              <li>• تأكد أن عنوان الموقع صحيح قبل كتابة بياناتك.</li>
              <li>• راجع صفحة الجلسات من وقت لآخر وأنهِ أي جهاز لا تعرفه.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ───── أسئلة ───── */}
      <section className="mx-auto max-w-3xl px-4 py-20 md:px-6">
        <SectionTitle title="أسئلة قبل التسجيل" />
        <Faq items={FAQ} />
      </section>

      {/* ───── دعوة أخيرة ───── */}
      <section className="mx-auto max-w-4xl px-4 md:px-6">
        <div className="hud relative overflow-hidden p-10 text-center md:p-14">
          <LogoMark height={84} className="mx-auto mb-5" />
          <h2 className="text-3xl font-bold md:text-4xl">جاهز تبدأ؟</h2>
          <p className="mx-auto mt-3 max-w-lg text-vayro-muted">أنشئ حسابك الآن واحصل على عناوينك. وإذا عندك حساب، ادخل مباشرة.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="#form" size="lg">أنشئ حسابك</LinkButton>
            <LinkButton href="/login" size="lg" variant="ghost">عندي حساب</LinkButton>
          </div>
          <p className="mt-6 text-xs text-vayro-muted">
            تابع آخر المستجدات في <Link href="/news" className="text-vayro-accent hover:underline">الأخبار</Link> و<Link href="/offers" className="text-vayro-accent hover:underline">العروض</Link>.
          </p>
        </div>
      </section>
    </>
  );
}

function RegisterFormSlot() {
  return (
    <div className="relative">
      <RegisterForm />
    </div>
  );
}
