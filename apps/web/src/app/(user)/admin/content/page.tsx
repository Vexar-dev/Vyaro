'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Pill, Skeleton } from '@/components/ui/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { TEXTAREA } from '@/components/admin/AdminShell';

interface Post { id: string; kind: 'NEWS' | 'OFFER'; status: 'DRAFT' | 'PUBLISHED'; title: string; excerpt: string | null; body: string; imageUrl: string | null; publishedAt: string | null }
const EMPTY = { kind: 'NEWS' as Post['kind'], status: 'PUBLISHED' as Post['status'], title: '', excerpt: '', body: '', imageUrl: null as string | null };

export default function ContentAdminPage() {
  const { accessToken } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ ...EMPTY });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<Post[]>('/admin/content/posts', { accessToken: accessToken! });
    setPosts(r.success && r.data ? r.data : []);
  }, [accessToken]);
  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  function edit(p: Post) { setEditId(p.id); setF({ kind: p.kind, status: p.status, title: p.title, excerpt: p.excerpt ?? '', body: p.body, imageUrl: p.imageUrl }); setErrs({}); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function reset() { setEditId(null); setF({ ...EMPTY }); setErrs({}); }

  async function save() {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 2) e.title = 'العنوان قصير جداً';
    if (!f.body.trim()) e.body = 'اكتب نص المنشور';
    setErrs(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = JSON.stringify({ ...f, title: f.title.trim(), excerpt: f.excerpt.trim() || null });
    const r = await apiFetch(editId ? `/admin/content/posts/${editId}` : '/admin/content/posts', { method: editId ? 'PUT' : 'POST', accessToken: accessToken!, body });
    setSaving(false);
    if (r.success) { toast(editId ? 'تم التعديل' : 'تم النشر', 'success'); reset(); load(); } else toast(r.error?.message ?? 'تعذّر الحفظ', 'error');
  }

  async function remove(p: Post) {
    if (!(await dlg.confirm({ title: 'حذف المنشور؟', message: `«${p.title}» سيُحذف نهائياً.`, tone: 'danger', confirmText: 'احذف' }))) return;
    const r = await apiFetch(`/admin/content/posts/${p.id}`, { method: 'DELETE', accessToken: accessToken! });
    if (r.success) { toast('تم الحذف', 'success'); load(); } else toast(r.error?.message ?? 'تعذّر الحذف', 'error');
  }

  return (
    <div className="max-w-3xl">
      <PageHeader icon="news" title="الأخبار والعروض" sub="انشر أخباراً وعروضاً بصورة وعنوان؛ تظهر فوراً بصفحتي الأخبار والعروض العامتين." />
      <section className="hud mb-8 space-y-4 p-6">
        <h3 className="font-display text-lg font-semibold">{editId ? 'تعديل منشور' : 'منشور جديد'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="النوع" value={f.kind} onChange={(v) => setF({ ...f, kind: v as Post['kind'] })} options={[{ value: 'NEWS', label: 'خبر' }, { value: 'OFFER', label: 'عرض' }]} />
          <Select label="الحالة" value={f.status} onChange={(v) => setF({ ...f, status: v as Post['status'] })} options={[{ value: 'PUBLISHED', label: 'منشور' }, { value: 'DRAFT', label: 'مسودة' }]} />
        </div>
        <Field label="العنوان" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} />
        <Field label="سطر صغير فوق العنوان، مثل اسم اللعبة (اختياري)" value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} />
        <div>
          <label className="mb-1.5 block text-sm text-vayro-muted">النص</label>
          <textarea className={TEXTAREA} rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          {errs.body && <p className="mt-1 text-xs text-vayro-danger">{errs.body}</p>}
        </div>
        <ImageUpload label="صورة المنشور" value={f.imageUrl} onChange={(u) => setF({ ...f, imageUrl: u })} />
        <div className="flex gap-2">
          <Button onClick={save} loading={saving}>{editId ? 'حفظ التعديل' : 'نشر'}</Button>
          {editId && <Button variant="ghost" onClick={reset}>إلغاء</Button>}
        </div>
      </section>
      {posts === null ? <Skeleton rows={3} /> : (
        <div className="space-y-2">
          {posts.length === 0 && <p className="text-sm text-vayro-muted">لا توجد منشورات.</p>}
          {posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-4">
              <div className="flex items-center gap-2 text-sm"><Pill tone={p.kind === 'OFFER' ? 'info' : 'muted'}>{p.kind === 'OFFER' ? 'عرض' : 'خبر'}</Pill><Pill tone={p.status === 'PUBLISHED' ? 'success' : 'muted'}>{p.status === 'PUBLISHED' ? 'منشور' : 'مسودة'}</Pill><span>{p.title}</span></div>
              <div className="flex gap-3 text-xs"><button className="text-vayro-accent hover:underline" onClick={() => edit(p)}>تعديل</button><button className="text-vayro-danger hover:underline" onClick={() => remove(p)}>حذف</button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
