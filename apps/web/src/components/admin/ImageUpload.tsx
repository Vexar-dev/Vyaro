'use client';

import { Icon } from '@/components/ui/Icon';
import { useRef, useState } from 'react';
import { mediaUrl, uploadImage } from '@/lib/media';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/Toast';

/** رفع صورة (PNG/JPG/WEBP حتى 5MB). يرجع الرابط النسبي المخزَّن بالسيرفر. */
export function ImageUpload({ label, value, onChange }: { label: string; value?: string | null; onChange: (url: string | null) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !accessToken) return;
    if (f.size > 5 * 1024 * 1024) return toast('الحد الأقصى للصورة 5MB', 'error');
    setBusy(true);
    const r = await uploadImage(accessToken, f);
    setBusy(false);
    if (r.url) onChange(r.url);
    else toast(r.error ?? 'تعذّر رفع الصورة', 'error');
  }

  return (
    <div>
      <p className="mb-1.5 text-sm text-vayro-muted">{label}</p>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-vayro-border bg-vayro-surface text-2xl text-vayro-muted">
          {value ? <img src={mediaUrl(value)} alt="" className="h-full w-full object-cover" /> : <Icon name="image" size={26} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-lg border border-vayro-border bg-vayro-card/40 px-4 py-2 text-xs transition hover:border-vayro-primary disabled:opacity-50">
            {busy ? 'جارِ الرفع…' : value ? 'استبدال الصورة' : 'رفع صورة'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="rounded-lg border border-vayro-danger/40 px-4 py-2 text-xs text-vayro-danger transition hover:bg-vayro-danger/10">
              إزالة
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} className="hidden" />
      </div>
    </div>
  );
}
