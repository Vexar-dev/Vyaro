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
import { mediaUrl } from '@/lib/media';
import { Icon } from '@/components/ui/Icon';

interface Sup { providerCode: string; sku: string; costAmount: string | null; costAssetCode: string | null; marginType: 'PERCENT' | 'FIXED' | null; marginValue: string | null; manualPrice: string | null; priceAmount: string; priceAssetCode: string; inStock: boolean; serviceActive: boolean }
interface Field { key: string; label: string }
interface Prod { fields: Field[]; id: string; name: string; categoryId: string; categoryName: string; imageUrl: string | null; isActive: boolean; supplier: Sup | null }
interface Cat { id: string; name: string }
const NUM = /^\d{1,12}(\.\d{1,8})?$/;

export default function ProductsPage() {
  const { accessToken } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [catId, setCatId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ products: Prod[]; total: number; limit: number } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Prod | null>(null);
  const [ef, setEf] = useState({ name: '', categoryId: '', description: '', imageUrl: null as string | null, isActive: true, fields: [] as Field[] });
  const [imgOpen, setImgOpen] = useState(false);
  const [marginOpen, setMarginOpen] = useState(false);
  const [mt, setMt] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [mv, setMv] = useState('10');
  const [bulkImg, setBulkImg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Cat[]>('/admin/store/categories', { accessToken }).then((r) => r.success && r.data && setCats(r.data));
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const q = new URLSearchParams({ page: String(page) });
    if (catId) q.set('categoryId', catId);
    if (search.trim()) q.set('search', search.trim());
    const r = await apiFetch<{ products: Prod[]; total: number; limit: number }>(`/admin/store/products?${q}`, { accessToken });
    if (r.success && r.data) setData(r.data); else toast(r.error?.message ?? 'تعذّر التحميل', 'error');
  }, [accessToken, page, catId, search, toast]);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = data ? data.products.every((p) => sel.has(p.id)) && data.products.length > 0 : false;
  const toggleAll = () => data && setSel((s) => { const n = new Set(s); data.products.forEach((p) => (allOnPage ? n.delete(p.id) : n.add(p.id))); return n; });

  async function bulkMargin() {
    if (!NUM.test(mv.trim())) return toast('قيمة غير صالحة', 'error');
    const r = await apiFetch<{ applied: number }>('/admin/store/products/bulk-margin', { method: 'POST', accessToken: accessToken!, body: JSON.stringify({ productIds: [...sel], marginType: mt, marginValue: mv.trim(), clearManualPrice: true }) });
    if (r.success) { toast('تم تطبيق الهامش وتحديث الأسعار', 'success'); setMarginOpen(false); load(); } else toast(r.error?.message ?? 'تعذّر التطبيق', 'error');
  }
  async function bulkActive(isActive: boolean) {
    if (!(await dlg.confirm({ title: isActive ? 'تفعيل المحدد؟' : 'إخفاء المحدد؟', message: isActive ? 'ستظهر المنتجات للمستخدمين (تأكد من أسعارها أولاً).' : 'ستختفي المنتجات من المتجر.', confirmText: 'نعم' }))) return;
    const r = await apiFetch('/admin/store/products/bulk-active', { method: 'POST', accessToken: accessToken!, body: JSON.stringify({ productIds: [...sel], isActive }) });
    if (r.success) { toast('تم', 'success'); load(); } else toast(r.error?.message ?? 'تعذّر', 'error');
  }
  async function setPrice(p: Prod) {
    const v = await dlg.prompt({ title: `سعر ${p.name}`, message: 'اكتب سعراً ثابتاً (يتجاوز الهامش). اتركه فارغاً لإرجاعه لحساب التكلفة + الهامش.', label: 'السعر', initial: p.supplier?.manualPrice ?? '', optional: true, icon: 'tag', confirmText: 'حفظ' });
    if (v === null) return;
    const manualPrice = v.trim() === '' ? null : v.trim();
    if (manualPrice && !NUM.test(manualPrice)) return toast('سعر غير صالح', 'error');
    const r = await apiFetch(`/admin/store/products/${p.id}/pricing`, { method: 'PATCH', accessToken: accessToken!, body: JSON.stringify({ manualPrice }) });
    if (r.success) { toast('تم تحديث السعر', 'success'); load(); } else toast(r.error?.message ?? 'تعذّر', 'error');
  }
  async function applyBulkImage() {
    const r = await apiFetch('/admin/store/products/bulk-image', { method: 'POST', accessToken: accessToken!, body: JSON.stringify({ productIds: [...sel], imageUrl: bulkImg }) });
    if (r.success) { toast('تم تطبيق الصورة على المحدد', 'success'); setImgOpen(false); setBulkImg(null); load(); } else toast(r.error?.message ?? 'تعذّر', 'error');
  }
  function openEdit(p: Prod) { setEdit(p); setEf({ name: p.name, categoryId: p.categoryId, description: '', imageUrl: p.imageUrl, isActive: p.isActive, fields: p.fields ?? [] }); }
  async function saveEdit() {
    if (!edit || !ef.name.trim()) return toast('الاسم مطلوب', 'error');
    setSaving(true);
    const body: Record<string, unknown> = { name: ef.name.trim(), categoryId: ef.categoryId, imageUrl: ef.imageUrl, isActive: ef.isActive, fields: ef.fields.filter((f) => f.key.trim()) };
    if (ef.description.trim()) body.description = ef.description.trim();
    const r = await apiFetch(`/admin/store/products/${edit.id}`, { method: 'PUT', accessToken: accessToken!, body: JSON.stringify(body) });
    setSaving(false);
    if (r.success) { toast('تم الحفظ', 'success'); setEdit(null); load(); } else toast(r.error?.message ?? 'تعذّر الحفظ', 'error');
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <div className="max-w-5xl">
      <PageHeader icon="box" title="المنتجات والأسعار" sub="حدّد منتجات وطبّق هامش ربح فوراً، أو اضبط سعر منتج بعينه (اختياري). المنتجات المستوردة تبدأ مخفية." />
      <div className="hud mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Select label="القسم" value={catId} onChange={(v) => { setCatId(v); setPage(1); }} options={[{ value: '', label: 'كل الأقسام' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
        <Field label="بحث بالاسم" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      {sel.size > 0 && (
        <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-vayro-primary/60 bg-vayro-card/95 p-3 backdrop-blur">
          <span className="text-sm">المحدد: <b>{sel.size}</b></span>
          <Button size="sm" onClick={() => setMarginOpen(true)}>تطبيق هامش</Button>
          <Button size="sm" variant="ghost" onClick={() => setImgOpen(true)}>صورة موحّدة</Button>
          <Button size="sm" variant="ghost" onClick={() => bulkActive(true)}>تفعيل</Button>
          <Button size="sm" variant="ghost" onClick={() => bulkActive(false)}>إخفاء</Button>
          <button className="ms-auto text-xs text-vayro-muted hover:underline" onClick={() => setSel(new Set())}>إلغاء التحديد</button>
        </div>
      )}
      {data === null ? <Skeleton rows={4} /> : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 px-2 text-xs text-vayro-muted"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-[rgb(var(--primary))]" />تحديد كل المعروض ({data.total} منتج)</label>
          {data.products.length === 0 && <p className="text-sm text-vayro-muted">لا منتجات. استورد من صفحة الموردين.</p>}
          {data.products.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-3">
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="accent-[rgb(var(--primary))]" aria-label={`تحديد ${p.name}`} />
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-vayro-border bg-vayro-surface">{p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" className="h-full w-full object-cover" /> : <Icon name="image" size={20} className="text-vayro-muted" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-vayro-muted">{p.categoryName}{p.supplier && <span dir="ltr"> · {p.supplier.providerCode}</span>}</p>
              </div>
              {p.supplier ? (
                <div className="text-xs" dir="ltr">
                  <p>تكلفة: {p.supplier.costAmount ?? '—'} {p.supplier.costAssetCode}</p>
                  <p>{p.supplier.manualPrice ? 'سعر يدوي' : p.supplier.marginValue ? `هامش ${p.supplier.marginValue}${p.supplier.marginType === 'PERCENT' ? '%' : ''}` : 'بلا هامش'}</p>
                  <p className="font-semibold text-vayro-accent">بيع: {p.supplier.priceAmount} {p.supplier.priceAssetCode}</p>
                </div>
              ) : <Pill tone="danger">بلا مورّد</Pill>}
              <div className="flex items-center gap-2">
                {!p.isActive && <Pill tone="muted">مخفي</Pill>}
                {p.supplier && !p.supplier.inStock && <Pill tone="danger">نفد</Pill>}
                <button className="text-xs text-vayro-accent hover:underline" onClick={() => setPrice(p)} disabled={!p.supplier}>سعر</button>
                <button className="text-xs text-vayro-accent hover:underline" onClick={() => openEdit(p)}>تعديل</button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-center gap-3 pt-3 text-sm">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
            <span>{page} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</Button>
          </div>
        </div>
      )}
      {marginOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => setMarginOpen(false)}>
          <div className="hud w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">هامش ربح لـ {sel.size} منتج</h3>
            <div className="grid grid-cols-2 gap-3">
              <Select label="النوع" value={mt} onChange={(v) => setMt(v as 'PERCENT' | 'FIXED')} options={[{ value: 'PERCENT', label: 'نسبة %' }, { value: 'FIXED', label: 'مبلغ ثابت' }]} />
              <Field label="القيمة" ltr inputMode="decimal" value={mv} onChange={(e) => setMv(e.target.value)} />
            </div>
            <p className="text-xs leading-6 text-vayro-muted">يُلغي الأسعار اليدوية للمحدد ويحسب السعر من التكلفة والهامش. تقدر تعدّل سعر أي منتج لوحده بعدها.</p>
            <div className="flex gap-2"><Button onClick={bulkMargin}>تطبيق</Button><Button variant="ghost" onClick={() => setMarginOpen(false)}>إلغاء</Button></div>
          </div>
        </div>
      )}
      {imgOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => setImgOpen(false)}>
          <div className="hud w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">صورة واحدة لـ {sel.size} منتج</h3>
            <ImageUpload label="الصورة" value={bulkImg} onChange={setBulkImg} />
            <div className="flex gap-2"><Button onClick={applyBulkImage} disabled={!bulkImg}>تطبيق على المحدد</Button><Button variant="ghost" onClick={() => setImgOpen(false)}>إلغاء</Button></div>
          </div>
        </div>
      )}
      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => setEdit(null)}>
          <div className="hud max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">تعديل منتج</h3>
            <Field label="الاسم" value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} />
            <Select label="القسم" value={ef.categoryId} onChange={(v) => setEf({ ...ef, categoryId: v })} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
            <Field label="وصف جديد (اتركه فارغاً لإبقاء الحالي)" value={ef.description} onChange={(e) => setEf({ ...ef, description: e.target.value })} />
            <ImageUpload label="صورة المنتج (تظهر عند الضغط عليه)" value={ef.imageUrl} onChange={(u) => setEf({ ...ef, imageUrl: u })} />
            <div className="space-y-2">
              <p className="text-sm text-vayro-muted">بيانات يكتبها المشتري عند الشراء (مثل معرّف اللاعب)</p>
              {ef.fields.map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-2">
                  <Field label="المفتاح" ltr value={f.key} onChange={(e) => setEf({ ...ef, fields: ef.fields.map((x, j) => (j === i ? { ...x, key: e.target.value.replace(/[^A-Za-z0-9_]/g, '') } : x)) })} />
                  <Field label="الاسم الظاهر" value={f.label} onChange={(e) => setEf({ ...ef, fields: ef.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <button type="button" aria-label="حذف الحقل" className="mb-1 grid h-10 w-10 place-items-center rounded-lg border border-vayro-danger/40 text-vayro-danger hover:bg-vayro-danger/10" onClick={() => setEf({ ...ef, fields: ef.fields.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              {ef.fields.length < 3 && <Button size="sm" variant="ghost" onClick={() => setEf({ ...ef, fields: [...ef.fields, { key: '', label: '' }] })}>إضافة حقل</Button>}
              <p className="text-xs text-vayro-muted">المفتاح يجب أن يطابق ما يطلبه المورد (مثل Player_ID).</p>
            </div>
            <Select label="الحالة" value={ef.isActive ? '1' : '0'} onChange={(v) => setEf({ ...ef, isActive: v === '1' })} options={[{ value: '1', label: 'ظاهر' }, { value: '0', label: 'مخفي' }]} />
            <div className="flex gap-2"><Button onClick={saveEdit} loading={saving}>حفظ</Button><Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
