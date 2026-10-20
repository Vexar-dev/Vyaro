'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/Toast';
import { Card, EmptyState, Notice, PageHeader, PageShell, Skeleton } from '@/components/ui/PageHeader';
import { KycGate } from '@/components/ui/KycGate';
import { Icon } from '@/components/ui/Icon';
import { useKyc } from '@/lib/kyc';

interface DepositAddress {
  networkCode: string;
  networkName: string;
  address: string;
}

const NETWORK_LABELS: Record<string, string> = {
  BEP20: 'USDT — BNB Smart Chain (BEP-20)',
  TRC20: 'USDT — Tron (TRC-20)',
  LTC: 'Litecoin (LTC)',
};
const NETWORK_TINT: Record<string, string> = { BEP20: '#d4a72c', TRC20: '#d9534f', LTC: '#9aa4b2' };

export default function DepositPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { kyc } = useKyc();
  const [addresses, setAddresses] = useState<DepositAddress[] | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [copiedNetwork, setCopiedNetwork] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    const res = await apiFetch<DepositAddress[]>('/deposit-addresses', { accessToken });
    if (res.success && res.data) setAddresses(res.data);
    else setError({ code: res.error?.code, message: res.error?.message ?? 'تعذّر تحميل عناوين الإيداع' });
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function copy(address: string, networkCode: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedNetwork(networkCode);
      toast(`تم نسخ عنوان ${NETWORK_LABELS[networkCode] ?? networkCode}`, 'success');
      setTimeout(() => setCopiedNetwork((c) => (c === networkCode ? null : c)), 2000);
    } catch {
      toast('تعذّر النسخ تلقائياً. حدّد العنوان وانسخه يدوياً.', 'error');
    }
  }

  return (
    <PageShell>
      <PageHeader icon="download" title="إيداع" sub="عنوانك الخاص على كل شبكة. أرسل فقط على الشبكة المطابقة." />

      {error?.code === 'KYC_REQUIRED' ? (
        <KycGate status={kyc?.status} message={error.message} />
      ) : (
        <>
          <Notice tone="danger">
            <strong>انتبه للشبكة.</strong> إرسال على شبكة خاطئة قد يؤدي لفقدان الأموال بشكل دائم.
          </Notice>

          {error && (
            <EmptyState icon="warning" title="تعذّر تحميل العناوين" action={<button onClick={load} className="rounded-lg border border-vayro-border px-4 py-2 text-sm hover:border-vayro-primary">إعادة المحاولة</button>}>
              {error.message}
            </EmptyState>
          )}

          {addresses === null && !error ? (
            <Skeleton />
          ) : (
            <div className="space-y-4">
              {(addresses ?? []).map((a, i) => (
                <Card key={a.networkCode} hover>
                  <div className="animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
                    <p className="mb-3 flex items-center gap-2.5 font-display text-lg font-semibold">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: NETWORK_TINT[a.networkCode] ?? '#7c6bd6' }} />
                      {NETWORK_LABELS[a.networkCode] ?? a.networkName}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <code dir="ltr" className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-vayro-border bg-vayro-surface px-3 py-2.5 text-start font-mono text-xs text-vayro-text">
                        {a.address}
                      </code>
                      <button
                        onClick={() => copy(a.address, a.networkCode)}
                        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition ${
                          copiedNetwork === a.networkCode ? 'border-vayro-success bg-vayro-success/15 text-vayro-success' : 'border-vayro-primary/60 bg-vayro-primary/10 text-vayro-text hover:bg-vayro-primary/20'
                        }`}
                      >
                        <Icon name={copiedNetwork === a.networkCode ? 'check' : 'copy'} size={16} />
                        {copiedNetwork === a.networkCode ? 'تم النسخ' : 'نسخ'}
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
              {addresses !== null && addresses.length === 0 && (
                <EmptyState icon="link" title="لا توجد عناوين إيداع بعد">
                  لم يتم توليد عناوين لحسابك. إذا استمر هذا، تواصل مع الإدارة (قد تكون الشبكات غير مفعّلة).
                </EmptyState>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
