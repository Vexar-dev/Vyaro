/**
 * إعدادات الموقع العامة — عدّل الروابط هنا فقط وتتغيّر في كل الموقع.
 * أي رابط قيمته '' يظهر معطّلاً (باهتاً) لحد ما تحط الرابط الحقيقي.
 */
export type SocialKey = 'instagram' | 'facebook' | 'whatsapp' | 'telegram' | 'x' | 'youtube' | 'tiktok' | 'email';

export interface SocialLink {
  key: SocialKey;
  label: string;
  icon: string;
  href: string;
  /** لون التوهّج عند التحويم */
  tint: string;
}

export const SITE = {
  name: 'VAYRO',
  tagline: 'عناوين إيداع للعملات الرقمية ومتجر رقمي، بحساب واحد.',
  supportEmail: '',
};

export const SOCIALS: SocialLink[] = [
  { key: 'telegram', label: 'تلغرام', icon: 'send', href: '', tint: '#38bdf8' },
  { key: 'whatsapp', label: 'واتساب', icon: 'phone', href: '', tint: '#34d399' },
  { key: 'instagram', label: 'إنستغرام', icon: 'instagram', href: '', tint: '#e879f9' },
  { key: 'facebook', label: 'فيسبوك', icon: 'facebook', href: '', tint: '#60a5fa' },
  { key: 'x', label: 'إكس (تويتر)', icon: 'x', href: '', tint: '#e5e7eb' },
  { key: 'youtube', label: 'يوتيوب', icon: 'youtube', href: '', tint: '#f87171' },
  { key: 'tiktok', label: 'تيك توك', icon: 'tiktok', href: '', tint: '#f472b6' },
  { key: 'email', label: 'البريد', icon: 'mail', href: '', tint: '#c4b5fd' },
];
