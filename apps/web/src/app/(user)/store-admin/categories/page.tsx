'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Pill, Skeleton } from '@/components/ui/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { mediaUrl } from '@/lib/media';
import { Icon } from '@/components/ui/Icon';

interface Cat { id: string; parentId: string | null; name: string; slug: string; imageUrl: string | null; description: string | null; isActive: boolean; sortOrder: number; productCount: number }
const EMPTY = { name: '', slug: '', parentId: '', imageUrl: null as string | null, description: '', isActive: true, sortOrder: '0' };

export default function CategoriesPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ ...EMPTY });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<Cat[]>('/admin/store/categories', { accessToken: accessToken! });
    setCats(r.success && r.data ? r.data : []);
  }, [accessToken]);
  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  function edit(c: Cat) { setEditId(c.id); setF({ name: c.name, slug: c.slug, parentId: c.parentId ?? '', imageUrl: c.imageUrl, description: c.description ?? '', isActive: c.isActive, sortOrder: String(c.sortOrder) }); setErrs({}); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function reset() { setEditId(null); setF({ ...EMPTY }); setErrs({}); }

  async function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'الاسم مطلوب';
    if (f.slug && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(f.slug)) e.slug = 'حروف إنجليزية صغيرة وأرقام و - فقط';
    if (!/^-?\d{1,6}$/.test(f.sortOrder)) e.sortOrder = 'رقم صحيح';
    setErrs(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = JSON.stringify({ name: f.name.trim(), slug: f.slug || `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, parentId: f.parentId || null, imageUrl: f.imageUrl, description: f.description.trim() || null, isActive: f.isActive, sortOrder: Number(f.sortOrder) });
    const r = await apiFetch(editId ? `/admin/store/categories/${editId}` : '/admin/store/categories', { method: editId ? 'PUT' : 'POST', accessToken: accessToken!, body });
    setSaving(false);
    if (r.success) { toast('تم الحفظ', 'success'); reset(); load(); } else toast(r.error?.message ?? 'تعذّر الحفظ', 'error');
  }

  const all = cats ?? [];
  const kids = (id: string | null) => all.filter((c) => (c.parentId ?? null) === id);
  // flattened tree with depth, in display order
  const flat: { c: Cat; depth: number }[] = [];
  const walk = (pid: string | null, depth: number, seen: Set<string>) => { for (const c of kids(pid)) { if (seen.has(c.id)) continue; flat.push({ c, depth }); walk(c.id, depth + 1, new Set(seen).add(c.id)); } };
  walk(null, 0, new Set());
  const banned = new Set<string>();
  if (editId) { banned.add(editId); let grew = true; while (grew) { grew = false; for (const c of all) if (c.parentId && banned.has(c.parentId) && !banned.has(c.id)) { banned.add(c.id); grew = true; } } }
  const Row = ({ c, depth }: { c: Cat; depth: number }) => (
    <div style={{ marginInlineStart: depth * 28 }} className="flex items-center justify-between gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-vayro-border bg-vayro-surface">{c.imageUrl ? <img src={mediaUrl(c.imageUrl)} alt="" className="h-full w-full object-cover" /> : <Icon name="image" size={20} className="text-vayro-muted" />}</div>
        <div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-vayro-muted" dir="ltr">{c.slug} · {c.productCount} منتج</p></div>
      </div>
      <div className="flex items-center gap-3">{!c.isActive && <Pill tone="muted">مخفي</Pill>}<button className="text-xs text-vayro-accent hover:underline" onClick={() => edit(c)}>تعديل</button></div>
    </div>
  );

  const parentOptions = [{ value: '', label: 'قسم رئيسي (بدون أب)' }, ...flat.filter(({ c }) => !banned.has(c.id)).map(({ c, depth }) => ({ value: c.id, label: `${'— '.repeat(depth)}${c.name}` }))];
  return (
    <div className="max-w-3xl">
      <PageHeader icon="box" title="الأقسام" sub="أقسام متداخلة بلا حد (مثلاً: ألعاب ID ← ببجي ← شدات)، لكل قسم صورة/شعار تظهر للمستخدم." />
      <section className="hud mb-8 space-y-4 p-6">
        <h3 className="font-display text-lg font-semibold">{editId ? 'تعديل قسم' : 'قسم جديد'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} />
          <Field label="الرابط المختصر (اختياري)" hint="اسم إنجليزي قصير يظهر في رابط القسم، مثل pubg. اتركه فارغاً ويُنشأ تلقائياً." ltr value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} error={errs.slug} />
        </div>
        <Select label="القسم الأب" value={f.parentId} onChange={(v) => setF({ ...f, parentId: v })} options={parentOptions} />
        <Field label="وصف (اختياري)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الترتيب" ltr value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} error={errs.sortOrder} />
          <Select label="الحالة" value={f.isActive ? '1' : '0'} onChange={(v) => setF({ ...f, isActive: v === '1' })} options={[{ value: '1', label: 'ظاهر' }, { value: '0', label: 'مخفي' }]} />
        </div>
        <ImageUpload label="صورة / شعار القسم" value={f.imageUrl} onChange={(u) => setF({ ...f, imageUrl: u })} />
        <div className="flex gap-2"><Button onClick={save} loading={saving}>{editId ? 'حفظ' : 'إضافة'}</Button>{editId && <Button variant="ghost" onClick={reset}>إلغاء</Button>}</div>
      </section>
      {cats === null ? <Skeleton rows={3} /> : (
        <div className="space-y-2">
          {cats.length === 0 && <p className="text-sm text-vayro-muted">لا توجد أقسام بعد.</p>}
          {flat.map(({ c, depth }) => <Row key={c.id} c={c} depth={depth} />)}
        </div>
      )}
    </div>
  );
}
