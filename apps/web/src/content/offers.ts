/**
 * عروض الموقع. نصوص مبدئية بدون أرقام أو أكواد — عدّلها بعروضك الحقيقية
 * (أضف code لإظهار زر نسخ الكود، وuntil لإظهار تاريخ الانتهاء).
 */
export interface Offer {
  id: string;
  icon: string;
  badge: string;
  title: string;
  desc: string;
  perks: string[];
  cta: { label: string; href: string };
  code?: string;
  until?: string; // ISO
  hot?: boolean;
}

export const OFFERS: Offer[] = [
  {
    id: 'welcome',
    icon: 'gift',
    badge: 'للأعضاء الجدد',
    title: 'عرض الانضمام',
    desc: 'أنشئ حسابك ووثّقه لتصلك عروض المتجر المخصّصة للأعضاء.',
    perks: ['عناوين إيداع خاصة بك على كل شبكة', 'متجر رقمي بنفس الحساب', 'وصول لعروض الأعضاء'],
    cta: { label: 'أنشئ حسابك', href: '/register#form' },
    hot: true,
  },
  {
    id: 'store',
    icon: 'cart',
    badge: 'المتجر',
    title: 'عروض المتجر الرقمي',
    desc: 'تصفّح المنتجات والخدمات المتاحة واشترِ من رصيدك مباشرة.',
    perks: ['الدفع من الرصيد', 'تتبّع حالة كل طلب', 'تأكيد قبل الشراء'],
    cta: { label: 'اذهب للمتجر', href: '/store' },
  },
  {
    id: 'verified',
    icon: 'key',
    badge: 'الحسابات الموثّقة',
    title: 'ميزات الحساب الموثّق',
    desc: 'وثّق هويتك لتفتح الخدمات التي تتطلب توثيقاً وتحمي حسابك أكثر.',
    perks: ['هوية مربوطة بحسابك', 'فتح الخدمات التي تتطلب توثيقاً', 'حماية أفضل من انتحال الحساب'],
    cta: { label: 'ابدأ التوثيق', href: '/profile' },
  },
];
