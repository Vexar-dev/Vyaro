# VAYRO — Phase 5

Provider System (Adapter architecture + Mock Provider)، مبنية فوق:
Phase 1 (Architecture/DB) + Phase 2 (Auth/Users) + Phase 3 (Wallet/Ledger) +
Phase 4 (Internal Transfers) — دون تغيير أي منها جوهريًا.

## الحالة الحالية (بحسب المراحل)

- Phase 1 — Architecture + DB + Folder Structure: مكتملة.
- Phase 2 — Auth + Users + Sessions + RBAC: مكتملة.
- Phase 3 — Wallet + Ledger: مكتملة ومُختبرة (رصيد حقيقي عبر Wallet API).
- Phase 4 — Internal Transfers (`@username` → `@username`): مكتملة، مع dashboard
  فعلي (إرسال/آخر العمليات) في `apps/web`.
- Phase 5 — Provider System (Interfaces + Registry + Mock + Sham Cash/Syriatel
  عبر TSA API): مكتملة. Sham Cash/Syriatel لهما Adapter حقيقي الآن لكنهما
  DISABLED حتى تُخزَّن بيانات اعتماد حقيقية.
- Phase 6 (جزء 1) — Custody/Deposit Addresses (HD Wallet محلي: BEP20/TRC20/LTC):
  مكتملة، تحقق منها المستخدم فعليًا (verify-master-seed نجح).
- Phase 6 (جزء 2) — Tatum Deposit Monitoring (Webhooks + Cron تأكيدات):
  مكتملة، **غير مُختبرة بالتنفيذ الفعلي** (راجع docs/05_APIS_AND_PROVIDERS.txt §7
  قبل أي استخدام حقيقي — mainnet).
- Phase 7 — Withdrawals (أول استخدام فعلي لـ Sham Cash/Syriatel Adapters عبر
  hold/release/settle): مكتملة، **غير مُختبرة بالتنفيذ الفعلي**.
- Phase 8 — Store (Product → ProviderService → Provider، نفس نمط hold/settle):
  مكتملة، **غير مُختبرة بالتنفيذ الفعلي**. بيانات تجريبية عبر Mock Provider.
- Phase 9 (جزء 1) — Admin: إدارة المستخدمين (تجميد/حظر/أدوار، مع حماية من
  تصعيد الصلاحيات + تدقيق كامل): مكتملة، **غير مُختبرة بالتنفيذ الفعلي**.
- Phase 9 (باقي الأجزاء)/10: لم تبدأ بعد.

## البدء السريع

راجع `docs/01_INSTALLATION.txt` للتفاصيل الكاملة. باختصار:

```bash
npm install
cp .env.example .env
# ولّد الأسرار: openssl rand -hex 32  (لكل من JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY)

cd apps/api
npx prisma generate
npx prisma migrate dev --name add_provider_logs_webhook_events_and_custody  # جداول Phase 5+6 الجديدة
npm run prisma:seed
npm run custody:generate-master-seed   # مرة واحدة فقط — اقرأ التحذيرات المطبوعة واحفظ العبارة السرية ورقيًا
npm run custody:verify-master-seed     # اقرأ المخرجات كاملة قبل المتابعة — راجع docs/05_APIS_AND_PROVIDERS.txt §6
npm run start:dev
```

## المستندات

- `docs/01_INSTALLATION.txt` — التثبيت والتشغيل، مع/بدون Docker.
- `docs/02_SECURITY_GUIDELINES.txt` — ما هو مُنفَّذ أمنيًا فعليًا، وما لم يُنفَّذ بعد.
- `docs/03_DATABASE_SCHEMA.txt` — شرح كل جدول والعلاقات وقرار الـ ORM.
- `docs/04_DOCKER_SETUP.txt` — تفاصيل docker-compose وسبب كل قرار.
- `docs/05_APIS_AND_PROVIDERS.txt` — عمارة الـ Provider Adapter (لا مزودين حقيقيين بعد).
- `docs/06_AUTHENTICATION.txt` — تدفقات التسجيل/الدخول/التجديد/الجلسات بالتفصيل.
- `docs/07_USERS_AND_IDENTITIES.txt` — نظام `@username` والحماية من IDOR.

## ⚠️ ملاحظة مهمة حول بيئة توليد هذا الكود

تم إنشاء هذا المشروع داخل بيئة sandbox **بلا اتصال بالإنترنت وبلا قاعدة بيانات
حقيقية متاحة**. أجزاء Phase 1-4 تم التحقق منها فعليًا محليًا (npm test/build
نجحا بعد إصلاحات بسيطة، مذكورة في المحادثة). كود **Phase 5 (Provider System)**
تحديدًا لم يُشغَّل بعد بأي شكل — لا `npm run build`، لا `npm run test`، ولا
`prisma migrate dev` ضد قاعدة بيانات حقيقية. راجع الخطوات في القسم أعلاه، وشغّل
على الأقل:

```bash
cd apps/api
npx prisma migrate dev --name add_provider_logs_and_webhook_events
npm run test -- providers
npm run build
```

قبل الاعتماد على هذا الجزء.
