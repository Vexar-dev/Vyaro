export const locales = ['ar', 'en', 'tr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';
export const rtlLocales: Locale[] = ['ar'];

// Only `ar` is populated in Phase 2. `en`/`tr` are reserved keys so the
// architecture is ready for translation without touching any component code.
export const messages = {
  ar: {
    'auth.login.title': 'تسجيل الدخول',
    'auth.login.identifier': 'اسم المستخدم أو البريد الإلكتروني',
    'auth.login.password': 'كلمة المرور',
    'auth.login.submit': 'دخول',
    'auth.login.forgot': 'نسيت كلمة المرور؟',
    'auth.login.noAccount': 'ليس لديك حساب؟',
    'auth.login.createAccount': 'إنشاء حساب',
    'auth.register.title': 'إنشاء حساب في VAYRO',
    'auth.register.username': 'اسم المستخدم (@username)',
    'auth.register.email': 'البريد الإلكتروني',
    'auth.register.phone': 'رقم الهاتف (اختياري)',
    'auth.register.password': 'كلمة المرور',
    'auth.register.submit': 'إنشاء الحساب',
    'auth.forgot.title': 'استعادة كلمة المرور',
    'auth.forgot.submit': 'إرسال رابط الاستعادة',
    'auth.reset.title': 'تعيين كلمة مرور جديدة',
    'auth.reset.submit': 'تحديث كلمة المرور',
    'nav.dashboard': 'الرئيسية',
    'nav.profile': 'الملف الشخصي',
    'nav.security': 'الأمان',
    'nav.sessions': 'الجلسات النشطة',
    'dashboard.placeholder': 'المحفظة والتحويلات والمتجر ستُفعَّل في المراحل القادمة.',
    'admin.login.title': 'دخول لوحة التحكم',
  },
  en: {},
  tr: {},
} satisfies Record<Locale, Record<string, string>>;

export function t(key: keyof (typeof messages)['ar'], locale: Locale = defaultLocale): string {
  return messages[locale][key] ?? messages.ar[key] ?? key;
}
