const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/** صور الرفع تُخزَّن كمسار نسبي (/api/v1/media/…) — نحوّله لرابط كامل للـ API. */
export function mediaUrl(u?: string | null): string {
  if (!u) return '';
  return u.startsWith('/api/') ? API_URL.replace(/\/api\/v1\/?$/, '') + u : u;
}

export async function uploadImage(accessToken: string, file: File): Promise<{ url?: string; error?: string }> {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch(`${API_URL}/admin/media`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` }, // لا نضع Content-Type: المتصفح يضيف boundary
      body: fd,
    });
    const j = await res.json();
    if (j.success) return { url: j.data.url as string };
    return { error: j.error?.message ?? 'تعذّر رفع الصورة' };
  } catch {
    return { error: 'تعذّر الاتصال بالسيرفر' };
  }
}
