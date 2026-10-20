'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { Card, EmptyState, Notice, PageHeader, Pill, Skeleton } from '@/components/ui/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';

interface Item { sku: string; name: string; categoryName?: string; costAmount: string; costAssetCode: string; inStock: boolean; params?: string[]; imported: boolean }
interface Cat { id: string; name: string; parentId: string | null }
const NUM = /^\d{1,12}(\.\d{1,8})?$/;
const ASSETS = ['VYR_SCD', 'VYR_SCS', 'USDT'];

function ImportInner() {
  const { accessToken } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const supplier = useSearchParams().get('supplier') ?? 'shahnstore';
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState('');
  const [asset, setAsset] = useState('VYR_SCD');
  const [mType, setMType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [mValue, setMValue] = useState('10');
  const [image, setImage] = useState<string | null>(null);
  const [activate, setActivate] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Item[]>(`/admin/store/suppliers/${supplier}/catalog`, { accessToken }).then((r) => {
      if (r.success && r.data) setItems(r.data); else { setItems([]); setError(r.error?.message ?? 'تعذّر جلب الكتالوج'); }
    });
    apiFetch<Cat[]>('/admin/store/categories', { accessToken }).then((r) => r.success && r.data && setCats(r.data));
  }, [accessToken, supplier]);

  const groups = useMemo(() => Array.from(new Set((items ?? []).map((i) => i.categoryName).filter(Boolean))) as string[], [items]);
  const shown = useMemo(() => (items ?? []).filter((i) => (!group || i.categoryName === group) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))), [items, q, group]);
  const selectable = shown.filter((i) => !i.imported);
  const allSel = selectable.length > 0 && selectable.every((i) => sel.has(i.sku));
  const toggle = (sku: string) => setSel((s) => { const n = new Set(s); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });
  const toggleAll = () => setSel((s) => { const n = new Set(s); selectable.forEach((i) => (allSel ? n.delete(i.sku) : n.add(i.sku))); return n; });
  const catName = (c: Cat): string => { const p = c.parentId ? cats.find((x) => x.id === c.parentId) : undefined; return p ? `${catName(p)} / ${c.name}` : c.name; };

  async function run() {
    if (!sel.size) return toast('اختر خدمة واحدة على الأقل', 'error');
    if (!categoryId) return toast('اختر القسم الذي ستوضع فيه', 'error');
    if (!NUM.test(mValue.trim())) return toast('قيمة الهامش غير صالحة', 'error');
    const ok = await dlg.confirm({
      title: `استيراد ${sel.size} خدمة`,
      icon: 'download',
      confirmText: 'استيراد',
      message: `سيُطبَّق هامش ${mValue}${mType === 'PERCENT' ? '%' : ''} على الكل، ويمكنك بعدها تعديل سعر أي خدمة لوحدها. ${activate === '1' ? 'ستظهر للمستخدمين فوراً.' : 'ستبقى مخفية حتى تفعّلها.'}`,
    });
    if (!ok) return;
    setBusy(true);
    const r = await apiFetch<{ created: number; skipped: { sku: string; reason: string }[] }>(`/admin/store/suppliers/${supplier}/import`, {
      method: 'POST', accessToken: accessToken!,
      body: JSON.stringify({ skus: [...sel], categoryId, saleAssetCode: asset, marginType: mType, marginValue: mValue.trim(), imageUrl: image, activate: activate === '1' }),
    });
    setBusy(false);
    if (!r.success || !r.data) return toast(r.error?.message ?? 'تعذّر الاستيراد', 'error');
    toast(`تم استيراد ${r.data.created} خدمة`, 'success');
    if (r.data.skipped.length) await dlg.alert({ title: 'لم يُستورد بعضها', icon: 'warning', message: <ul className="space-y-1 text-sm">{r.data.skipped.map((s) => <li key={s.sku} dir="auto"><b dir="ltr">{s.sku}</b>: {s.reason}</li>)}</ul> });
    setSel(new Set());
    const c = await apiFetch<Item[]>(`/admin/store/suppliers/${supplier}/catalog`, { accessToken: accessToken! });
    if (c.success && c.data) setItems(c.data);
  }

  return (
    <div className="max-w-5xl">
      <PageHeader icon="download" title="استيراد خدمات" sub="اختر عدة خدمات من المورد، حدّد قسمها وهامشاً واحداً لكلها وصورة واحدة مشتركة. تعدّل بعدها سعر كل خدمة لحالها من صفحة المنتجات." />
      {error && <Notice tone="danger">{error}</Notice>}
      {items === null ? <Skeleton rows={4} /> : items.length === 0 && !error ? <EmptyState icon="box" title="لا توجد خدمات لدى المورد" /> : items.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Field label="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select label="قسم المورد" value={group} onChange={setGroup} options={[{ value: '', label: 'الكل' }, ...groups.map((g) => ({ value: g, label: g }))]} />
            </div>
            <label className="mb-2 flex items-center gap-2 px-1 text-xs text-vayro-muted"><input type="checkbox" checked={allSel} onChange={toggleAll} className="accent-[rgb(var(--primary))]" />تحديد كل المعروض ({selectable.length})</label>
            <div className="max-h-[60vh] space-y-2 overflow-auto pe-1">
              {shown.map((i) => (
                <label key={i.sku} className={`flex cursor-pointer items-center gap-3 rounded-xl2 border p-3 text-sm transition ${sel.has(i.sku) ? 'border-vayro-primary bg-vayro-primary/10' : 'border-vayro-border bg-vayro-card'} ${i.imported ? 'opacity-50' : ''}`}>
                  <input type="checkbox" disabled={i.imported} checked={sel.has(i.sku)} onChange={() => toggle(i.sku)} className="accent-[rgb(var(--primary))]" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{i.name}</span><span className="block text-xs text-vayro-muted">{i.categoryName}{i.params?.length ? ` · يطلب: ${i.params.join('، ')}` : ''}</span></span>
                  <span className="shrink-0 text-xs" dir="ltr">{i.costAmount} {i.costAssetCode}</span>
                  {i.imported ? <Pill tone="muted">مستورد</Pill> : !i.inStock ? <Pill tone="danger">نفد</Pill> : null}
                </label>
              ))}
            </div>
          </div>
          <Card className="h-fit space-y-4 lg:sticky lg:top-4">
            <p className="text-sm">المحدد: <b>{sel.size}</b></p>
            <Select label="القسم في متجرك" value={categoryId} onChange={setCategoryId} placeholder="اختر القسم" options={cats.map((c) => ({ value: c.id, label: catName(c) }))} />
            <Select label="عملة البيع" value={asset} onChange={setAsset} options={ASSETS.map((a) => ({ value: a, label: a }))} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="نوع الهامش" value={mType} onChange={(v) => setMType(v as 'PERCENT' | 'FIXED')} options={[{ value: 'PERCENT', label: 'نسبة %' }, { value: 'FIXED', label: 'مبلغ ثابت' }]} />
              <Field label="الهامش" value={mValue} onChange={(e) => setMValue(e.target.value)} ltr inputMode="decimal" />
            </div>
            <ImageUpload label="صورة مشتركة لكل الخدمات المحددة" value={image} onChange={setImage} />
            <Select label="بعد الاستيراد" value={activate} onChange={setActivate} options={[{ value: '0', label: 'مخفية حتى أراجعها' }, { value: '1', label: 'ظاهرة فوراً' }]} />
            <Button className="w-full" loading={busy} disabled={!sel.size} onClick={run}>استيراد المحدد</Button>
            {asset !== 'USDT' && <p className="text-xs leading-6 text-vayro-muted">تكلفة المورد تُسجَّل بـ USDT، لذلك يلزم سعر صرف من USDT إلى {asset} (صفحة أسعار الصرف) وإلا سيفشل حساب السعر.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={null}>
      <ImportInner />
    </Suspense>
  );
}
