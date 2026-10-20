'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

export interface KycState {
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  submittedAt: string | null;
  requirements: { depositAddresses: boolean; withdrawals: boolean; shamcashWithdrawals: boolean; store: boolean; transfers: boolean };
}

/** حالة توثيق الهوية للمستخدم الحالي. null أثناء التحميل. */
export function useKyc() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<KycState | null>(null);
  const reload = useCallback(async () => {
    if (!accessToken) return;
    const res = await apiFetch<KycState>('/kyc/me', { accessToken });
    if (res.success && res.data) setState(res.data);
  }, [accessToken]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { kyc: state, reload };
}
