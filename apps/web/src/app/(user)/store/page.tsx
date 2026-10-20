'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { mediaUrl } from '@/lib/media';
import { EmptyState, Notice, PageHeader, PageShell, Pill, Skeleton } from '@/components/ui/PageHeader';
import { Poster } from '@/components/ui/Poster';
import { Reveal } from '@/components/ui/Reveal';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';

interface Product {
  productId: string;
  name: string;
  description: string | null;
  categorySlug: string;
  imageUrl: string | null;
  inStock: boolean;
  priceAssetCode: string | null;
  priceAmount: string | null;
  fields: { key: string; label: string }[];
}

interface Category { slug: string; name: string; imageUrl: string | null; parentSlug: string | null }

interface Order {
  orderId: string;
  status: string;
  amount: string;
  assetCode: string;
  quantity: number;
  providerOrderId: string | null;
  note: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  PROCESSING: 'قيد المعالجة',
  COMPLETED: 'مكتمل',
  FAILED: 'فشل',
  CANCELLED: 'أُلغي',
  REFUNDED: 'مُسترَد',
};

const CAT_ICON: Record<string, string> = { games: 'game', gift: 'gift', cards: 'gift', software: 'box', subscriptions: 'key' };

function FieldsForm({ fields, out, summary }: { fields: { key: string; label: string }[]; out: React.MutableRefObject<Record<string, string>>; summary: React.ReactNode }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-vayro-border bg-vayro-surface p-4 text-sm">{summary}</div>
      {fields.map((f) => (
        <Field key={f.key} label={f.label} ltr value={vals[f.key] ?? ''} onChange={(e) => { const v = { ...vals, [f.key]: e.target.value }; setVals(v); out.current = v; }} autoComplete="off" />
      ))}
    </div>
  );
}

export default function StorePage() {
  const { accessToken } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState<string>('');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadProducts = useCallback(async () => {
    const res = await apiFetch<Product[]>(`/store/products${cat ? `?category=${encodeURIComponent(cat)}` : ''}`);
    if (res.success && res.data) setProducts(res.data);
  }, [cat]);

  useEffect(() => {
    apiFetch<Category[]>('/store/categories').then((r) => r.success && r.data && setCats(r.data));
  }, []);

  const loadOrders = useCallback(async () => {
    if (!accessToken) return;
    const res = await apiFetch<Order[]>('/store/orders', { accessToken });
    if (res.success && res.data) setOrders(res.data);
  }, [accessToken]);

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, [loadProducts, loadOrders]);

  function details(p: Product) {
    dlg.alert({
      title: p.name,
      icon: 'box',
      confirmText: 'إغلاق',
      message: (
        <div>
          {p.imageUrl && <img src={mediaUrl(p.imageUrl)} alt="" className="mb-4 max-h-64 w-full rounded-lg object-cover" />}
          {p.description && <p className="whitespace-pre-line text-sm leading-7">{p.description}</p>}
          <p className="mt-3 font-mono text-sm font-semibold text-vayro-text" dir="ltr">{p.priceAmount} {p.priceAssetCode}</p>
        </div>
      ),
    });
  }

  async function buy(product: Product) {
    if (!accessToken) return;

    const typed = { current: {} as Record<string, string> };
    const summary = (
      <>
        <p className="font-semibold text-vayro-text">{product.name}</p>
        <p className="mt-2 flex justify-between">
          <span>السعر</span>
          <span className="font-semibold text-vayro-text" dir="ltr">{product.priceAmount} {product.priceAssetCode}</span>
        </p>
        <p className="mt-3 text-xs">سيُخصم المبلغ من رصيدك مباشرة.</p>
      </>
    );
    const ok = await dlg.confirm({
      title: 'تأكيد الشراء',
      icon: 'cart',
      confirmText: 'اشترِ الآن',
      message: <FieldsForm fields={product.fields ?? []} out={typed} summary={summary} />,
    });
    if (!ok) return;
    for (const f of product.fields ?? []) {
      if (!(typed.current[f.key] ?? '').trim()) { toast(`الحقل مطلوب: ${f.label}`, 'error'); return; }
    }
    const purchaseMetadata: Record<string, string> = {};
    for (const f of product.fields ?? []) purchaseMetadata[f.key] = typed.current[f.key].trim();

    setMessage(null);
    setBuyingId(product.productId);

    const res = await apiFetch<{ status: string; note: string | null }>('/store/orders', {
      method: 'POST',
      accessToken,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ productId: product.productId, quantity: 1, ...(Object.keys(purchaseMetadata).length ? { purchaseMetadata } : {}) }),
    });

    setBuyingId(null);
    if (!res.success || !res.data) {
      const text = res.error?.message ?? 'تعذّر إتمام الشراء';
      setMessage({ ok: false, text });
      toast(text, 'error');
      return;
    }
    const text =
      res.data.status === 'COMPLETED' ? `تم شراء "${product.name}" بنجاح` : res.data.note ?? `الحالة: ${res.data.status}`;
    setMessage({ ok: res.data.status === 'COMPLETED', text });
    toast(text, res.data.status === 'COMPLETED' ? 'success' : 'info');
    await loadOrders();
  }

  const current = cats.find((c) => c.slug === cat) ?? null;
  const children = cats.filter((c) => (c.parentSlug ?? '') === cat);
  const here = (products ?? []).filter((p) => (cat === '' ? false : children.length === 0 ? true : p.categorySlug === cat));

  return (
    <PageShell wide>
      <PageHeader icon="cart" title={current ? current.name : 'المتجر'} action={current ? <button onClick={() => setCat(current.parentSlug ?? '')} className="inline-flex items-center gap-2 rounded-lg border border-vayro-border px-4 py-2 text-sm text-vayro-muted transition hover:border-vayro-primary hover:text-vayro-text"><Icon name="arrow-right" size={16} />رجوع</button> : undefined} />

      {message && <Notice tone={message.ok ? 'success' : 'danger'}>{message.text}</Notice>}

      {children.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {children.map((c, i) => (
            <Reveal key={c.slug} delay={(i % 5) * 70}><Poster image={c.imageUrl} title={c.name} label={cat === '' ? undefined : current?.name} onClick={() => setCat(c.slug)} fallbackIcon={CAT_ICON[c.slug] ?? 'game'} /></Reveal>
          ))}
        </div>
      )}

      {cat !== '' && (products === null ? (
        <Skeleton rows={2} />
      ) : (
        <div className="space-y-2">
          {here.map((p, i) => (
            <Reveal key={p.productId} delay={Math.min(i, 8) * 40}>
            <div className="hud hud-hover flex items-center gap-4 !p-3 md:!p-4">
              <button type="button" onClick={() => details(p)} aria-label={`تفاصيل ${p.name}`} className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-vayro-border bg-vayro-surface transition hover:border-vayro-primary">
                {p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" className="h-full w-full object-cover" /> : <Icon name={CAT_ICON[p.categorySlug] ?? 'diamond'} size={24} className="text-vayro-muted" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-vayro-text">{p.name}</p>
                <p className="font-mono text-sm text-vayro-accent" dir="ltr">{p.priceAmount} {p.priceAssetCode}</p>
              </div>
              <button onClick={() => buy(p)} disabled={buyingId === p.productId || !p.inStock} className="btn-glow rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50">
                {buyingId === p.productId ? '...' : p.inStock ? 'شراء' : 'نفد'}
              </button>
            </div>
            </Reveal>
          ))}
          {here.length === 0 && children.length === 0 && <EmptyState icon="box" title="لا توجد منتجات في هذا القسم حالياً" />}
        </div>
      ))}
      {cat === '' && children.length === 0 && cats.length === 0 && products !== null && <EmptyState icon="store" title="المتجر فارغ حالياً" />}

      <h3 className="mb-4 mt-12 text-xl font-semibold">طلباتي</h3>
      {orders === null ? (
        <Skeleton rows={2} />
      ) : orders.length === 0 ? (
        <EmptyState icon="cart" title="لا توجد طلبات بعد" />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.orderId} className="flex items-center justify-between gap-3 rounded-xl2 border border-vayro-border bg-vayro-card/80 p-4 transition hover:border-vayro-primary/50">
              <div>
                <p className="font-mono text-sm text-vayro-text" dir="ltr">
                  {o.amount} {o.assetCode} × {o.quantity}
                </p>
                <p className="mt-0.5 text-xs text-vayro-muted">{new Date(o.createdAt).toLocaleString('ar')}</p>
                {o.note && <p className="mt-1 text-xs text-vayro-muted">{o.note}</p>}
              </div>
              <Pill tone={o.status === 'COMPLETED' ? 'success' : o.status === 'FAILED' || o.status === 'CANCELLED' ? 'danger' : 'info'}>
                {STATUS_LABELS[o.status] ?? o.status}
              </Pill>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
