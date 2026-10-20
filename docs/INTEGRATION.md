# دمج تصميم VAYRO الجديد

الملفات بنفس هيكل مشروعك (`apps/web/src/...`). انسخها فوق مشروعك.

## 1) الحزم (apps/web)
```
npm i @fontsource-variable/cairo @fontsource-variable/jetbrains-mono @fontsource/reem-kufi
npm i -D tailwindcss@3 postcss autoprefixer      # إن لم تكن موجودة
```
الخطوط محلية (بدون Google Fonts) فلا يتصل المتصفح بأي طرف خارجي.

## 2) ملفات جديدة / مستبدلة
- `tailwind.config.ts`, `postcss.config.js` — **ما كانوا في الـ zip**. إذا عندك ملفات بنفس الاسم، ادمج: ألوان `vayro.*` صارت CSS variables (داكن/فاتح) والأسماء القديمة (`vayro-primary` ...) كما هي.
- `src/app/globals.css` — الألوان، الأجواء، زوايا HUD، الأزرار.
- `src/app/layout.tsx` — **إذا عندك layout جذري، ادمجه**: المطلوب فقط `<Providers>` داخل `<body>` + سكربت الثيم + `dir="rtl"`. (`Providers` يحتوي AuthProvider الذي كان عندك.)
- `src/app/page.tsx` — يحوّل `/` إلى `/register`.

## 3) مكوّنات (src/components)
- `ui/DialogProvider.tsx` — بديل confirm/prompt/alert: `const dlg = useDialog(); await dlg.confirm({...})`
- `ui/Select.tsx` — بديل `<select>` (القائمة الأصلية للمتصفح)
- `ui/Field.tsx` — حقول مع رسائل خطأ مصمَّمة (استعمل `<form noValidate>`)
- `ui/Toast.tsx`, `ui/ThemeProvider.tsx`, `ui/Button.tsx`, `ui/Faq.tsx`, `ui/PageHeader.tsx`
- `layout/SocialDock.tsx` — دائرة التواصل الثابتة، `layout/SiteChrome.tsx` + `SiteShell.tsx` — ترويسة وتذييل الصفحات العامة
- `brand/Logo.tsx` (اللوغو: `LogoMark` + `Wordmark`، نسخة داكنة وفاتحة)، `brand/Illustrations.tsx` (4 رسومات SVG أصلية)
- `public/brand/*.png` — اللوغو مستخرج من صورتك بخلفية شفافة (+ أيقونة الموقع). **ملفات `public/` لازم تنسخها كذلك.**

## 4) صفحات
- جديدة: `(auth)/register` (الصفحة الطويلة), `(auth)/login`, `(site)/news`, `(site)/offers`
- معاد تصميمها بنفس المنطق: `(user)/layout`, `deposit`, `withdraw`, `store`, `admin/users`

## 5) شيء لازم تعدّله أنت
1. **روابط التواصل**: `src/config/site.ts` — ضع الرابط الحقيقي لكل حساب. الفارغ يظهر باهتاً مع "قريباً".
2. **الأخبار والعروض**: `src/content/news.ts` و `offers.ts` — نصوص مبدئية مبنية على مزايا الموقع الفعلية؛ التواريخ والعروض أمثلة، بدّلها قبل النشر.
3. **نص الحماية والتوثيق** في صفحة التسجيل: كتبته من الكود (جلسة بالذاكرة، كوكي HttpOnly، Idempotency-Key، فحص الملكية، الجلسات، 2FA). تأكد أن كل جملة تطابق ما هو مفعّل عندك، خصوصاً "وثائقك لا يراها أي مستخدم آخر" وفكرة أن بعض الخدمات تتطلب توثيقاً.
4. **أسماء حقول الـ API** في `RegisterForm.tsx` (`/auth/register`) و `login/page.tsx` (`/auth/login`, الحقل `identifier`): افتراضية، طابقها مع الـ DTO.
5. قواعد اسم المستخدم في RegisterForm (3–20، حروف/أرقام/_/.) تقريبية — اربطها بـ `UsernamePolicy`.

## تغيير سلوك واحد
في إدارة المستخدمين، الضغط على "إلغاء" في نافذة السبب كان قبل (window.prompt) يكمل العملية. الآن **يلغيها** (وكل إجراء إداري يطلب تأكيداً).

## صفحات لم تكن في الـ zip
`/dashboard` `/profile` `/security` `/sessions` `/login` سابقاً: لم أعدّل الموجود منها (لم أرها). استعمل `PageHeader`, `Field`, `Select`, `useDialog` ونفس الكلاسات (`hud`, `btn-glow`) لتطابق.

## تحديث: الرقم الإلزامي والسحب
**الواجهة (جاهزة):** التسجيل يطلب رقم الهاتف (إلزامي) مع نافذة تأكيد "الرقم نهائي". صفحة السحب لـ Syriatel لا تدخل أي رقم، تعرض الرقم المسجَّل فقط.
**المطلوب من الباك إند (لازم يتطبق عندك، الواجهة وحدها لا تحمي):**
1. `POST /auth/register` يستقبل `phone` (E.164 مثل `+963933123456`)، إلزامي وفريد.
2. الرقم **ثابت فعلياً**: لا endpoint لتعديله، وقيد على قاعدة البيانات (trigger يرفض UPDATE على العمود).
3. `GET /users/me` يرجع `phone`.
4. `POST /withdrawals` مع `syriatel`: السيرفر يتجاهل أي رقم قادم من المتصفح ويستخدم الرقم المخزَّن بالحساب فقط. لم تعد الواجهة ترسل `toGsm`.
5. **Sham Cash مثل Syriatel**: الوجهة هي رقم التسجيل الثابت، ولم تعد الواجهة ترسل `toAddress` ولا `toGsm`. (إذا Sham Cash يحتاج معرّفاً غير الرقم، لازم يُجمع عند التسجيل ويُقفل بنفس الطريقة.)
6. حقول PIN أُزيلت من نموذج السحب (التحويل التلقائي من حساب الموقع لا يحتاج PIN المستخدم).
