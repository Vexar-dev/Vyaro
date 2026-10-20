'use client';

import { EmptyState } from './PageHeader';
import { LinkButton } from './Button';

/** يظهر بدل المحتوى عندما يرفض السيرفر العملية لأن الهوية غير موثّقة. */
export function KycGate({ status, message }: { status?: string; message?: string }) {
  const pending = status === 'PENDING';
  return (
    <EmptyState
      icon={pending ? 'hourglass' : 'shield-check'}
      title={pending ? 'طلب التوثيق قيد المراجعة' : 'يلزم توثيق هويتك'}
      action={<LinkButton href="/kyc">{pending ? 'عرض حالة الطلب' : 'وثّق هويتك الآن'}</LinkButton>}
    >
      {message ?? (pending ? 'سنفتح لك هذه الخدمة فور الموافقة على طلبك.' : 'هذه الخدمة تتطلب توثيق الهوية. الخطوة تأخذ دقائق قليلة.')}
    </EmptyState>
  );
}
