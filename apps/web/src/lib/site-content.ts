'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api-client';

export interface SitePost { id: string; kind: 'NEWS' | 'OFFER'; title: string; excerpt: string | null; body: string; imageUrl: string | null; publishedAt: string | null }
export interface SiteSettingsPublic {
  'login.images': { images?: string[] } | null;
  'site.social': Record<string, string> | null;
  'site.announcement': { enabled?: boolean; text?: string } | null;
}

let sitePromise: Promise<SiteSettingsPublic | null> | null = null;
/** إعدادات الموقع العامة (صور الدخول، روابط التواصل، الشريط). تُجلب مرة واحدة لكل تحميل صفحة. */
export function useSiteSettings(): SiteSettingsPublic | null {
  const [v, setV] = useState<SiteSettingsPublic | null>(null);
  useEffect(() => {
    sitePromise ??= apiFetch<SiteSettingsPublic>('/content/site').then((r) => (r.success && r.data ? r.data : null)).catch(() => null);
    let live = true;
    sitePromise.then((d) => live && setV(d));
    return () => { live = false; };
  }, []);
  return v;
}

/** منشورات منشورة من لوحة الأدمن. null = جارِ التحميل، [] = لا شيء أو تعذّر الجلب. */
export function usePosts(kind: 'NEWS' | 'OFFER'): SitePost[] | null {
  const [v, setV] = useState<SitePost[] | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch<SitePost[]>(`/content/posts?kind=${kind}`).then((r) => live && setV(r.success && r.data ? r.data : [])).catch(() => live && setV([]));
    return () => { live = false; };
  }, [kind]);
  return v;
}
