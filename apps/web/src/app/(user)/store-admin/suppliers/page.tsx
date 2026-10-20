'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useDialog } from '@/components/ui/DialogProvider';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Pill, Skeleton } from '@/components/ui/PageHeader';

interface Sup { code: string; name: string; status: string; hasKey: boolean; implemented: boolean }
const LABEL: Record<string, string> = { shahnstore: 'Shahn Store (الأساسي)', shamekh_bot: 'بوت شامخ (Railway)', canboso: 'Canboso', mock: 'وهمي (للتجربة فقط)' };

export default function SuppliersPage() {
  const { accessToken, user } = useAuth();
  const dlg = useDialog();
  const toast = useToast();
  const [rows, setRows] = useState<Sup[] | null>(null);
  const [busy, setBusy] = useState('');
  const [keys, setKeys] = useState<Record<string, string>>({});
  const canKeys = !!user?.roles?.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));

  const load = useCallback(async () => {
    if (!accessToken) return;
    const r = await apiFetch<Sup[]>('/admin/store/suppliers', { accessToken });
    setRows(r.success && r.data ? r.data : []);
  }, [accessToken]);
  useEffect(() => { load(); }, [load]);

  async function saveKey(code: string) {
    const apiKey = (keys[code] ?? '').trim();
    if (apiKey.length < 8) return toast('اكتب المفتاح كاملاً', 'error');
    setBusy(code + 'k');
    const r = await apiFetch(`/admin/store/suppliers/${code}/credential`, { method: 'PUT', accessToken: accessToken!, body: JSON.stringify({ apiKey }) });
    setBusy('');
    if (r.success) { toast('تم حفظ المفتاح مشفّراً', 'success'); setKeys({ ...keys, [code]: '' }); load(); } else toast(r.error?.message ?? 'تعذّر الحفظ', 'error');
  }

  async function setStatus(code: string, status: 'ACTIVE' | 'DISABLED') {
    setBusy(code + 's');
    const r = await apiFetch(`/admin/store/suppliers/${code}/status`, { method: 'PUT', accessToken: accessToken!, body: JSON.stringify({ status }) });
    setBusy('');
    if (r.success) { toast(status === 'ACTIVE' ? 'تم تفعيل المورد' : 'تم إيقاف المورد', 'success'); load(); } else toast(r.error?.message ?? 'تعذّر', 'error');
  }

  async function sync(code: string) {
    const asset = await dlg.prompt({ title: 'تحديث أسعار وتوفّر المنتجات المستوردة', message: 'اكتب رمز عملة البيع. تُحدَّث التكلفة والتوفر وتُعاد حسابات الأسعار، ولا يُستورد أي منتج جديد من هنا.', label: 'رمز العملة', initial: 'VYR_SCD', icon: 'refresh', confirmText: 'تحديث' });
    if (!asset) return;
    setBusy(code);
    const r = await apiFetch<Record<string, unknown>>(`/admin/store/suppliers/${code}/sync`, { method: 'POST', accessToken: accessToken!, body: JSON.stringify({ saleAssetCode: asset.trim().toUpperCase() }) });
    setBusy('');
    if (r.success) await dlg.alert({ title: 'اكتمل التحديث', message: <pre className="text-xs" dir="ltr">{JSON.stringify(r.data, null, 2)}</pre>, icon: 'check' });
    else toast(r.error?.message ?? 'فشل التحديث', 'error');
  }

  return (
    <div className="max-w-2xl">
      <PageHeader icon="plug" title="الموردون" sub="احفظ مفتاح المورد، فعّله، ثم استورد خدماته من صفحة الاستيراد." />
      {rows === null ? <Skeleton rows={3} /> : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.code} className="hud space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm"><p className="font-semibold">{LABEL[s.code] ?? s.name}</p><p className="text-xs text-vayro-muted" dir="ltr">{s.code}</p></div>
                <div className="flex items-center gap-2">
                  {!s.implemented && <Pill tone="muted">المحوّل غير جاهز</Pill>}
                  <Pill tone={s.hasKey ? 'success' : 'muted'}>{s.hasKey ? 'المفتاح محفوظ' : 'بلا مفتاح'}</Pill>
                  <Pill tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{s.status === 'ACTIVE' ? 'فعّال' : 'غير فعّال'}</Pill>
                </div>
              </div>
              {s.implemented && s.code !== 'mock' && canKeys && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field className="min-w-[14rem] flex-1" label="مفتاح API" type="password" reveal ltr value={keys[s.code] ?? ''} onChange={(e) => setKeys({ ...keys, [s.code]: e.target.value })} autoComplete="off" />
                  <Button size="sm" variant="ghost" loading={busy === s.code + 'k'} onClick={() => saveKey(s.code)}>حفظ المفتاح</Button>
                </div>
              )}
              {s.implemented && (
                <div className="flex flex-wrap gap-2">
                  {canKeys && (s.status === 'ACTIVE'
                    ? <Button size="sm" variant="danger" loading={busy === s.code + 's'} onClick={() => setStatus(s.code, 'DISABLED')}>إيقاف</Button>
                    : <Button size="sm" loading={busy === s.code + 's'} onClick={() => setStatus(s.code, 'ACTIVE')}>تفعيل</Button>)}
                  {s.status === 'ACTIVE' && <LinkButton href={`/store-admin/import?supplier=${s.code}`} size="sm" variant="ghost">استيراد خدمات</LinkButton>}
                  {s.status === 'ACTIVE' && <Button size="sm" variant="ghost" loading={busy === s.code} onClick={() => sync(s.code)}>تحديث الأسعار والتوفر</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
