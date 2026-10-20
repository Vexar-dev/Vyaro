import { Icon } from './Icon';

/** غلاف موحّد لكل صفحات اللوحة: نفس العرض ونفس حركة الدخول. wide للجداول والإدارة. */
export function PageShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full animate-rise ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>{children}</div>;
}

export function PageHeader({ icon, title, sub, action }: { icon: string; title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-vayro-border bg-vayro-card text-vayro-primary shadow-glow" aria-hidden>
          <Icon name={icon} size={24} />
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold md:text-3xl">{title}</h2>
          {sub && <p className="mt-1.5 max-w-xl text-sm leading-7 text-vayro-muted">{sub}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

/** كرت موحّد. */
export function Card({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return <div className={`hud p-5 md:p-6 ${hover ? 'hud-hover' : ''} ${className}`}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="font-display text-lg font-semibold">{children}</h3>
      {aside}
    </div>
  );
}

/** حالة فارغة مرسومة (بدون إيموجي). */
export function EmptyState({ icon = 'box', title, children, action }: { icon?: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-vayro-border bg-vayro-card/40 px-6 py-10 text-center">
      <span className="ico-float mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-vayro-border bg-vayro-surface text-vayro-muted">
        <Icon name={icon} size={26} />
      </span>
      <p className="font-display text-lg">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-sm leading-7 text-vayro-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

const TONES = {
  success: 'border-vayro-success/40 bg-vayro-success/10 text-vayro-success',
  danger: 'border-vayro-danger/40 bg-vayro-danger/10 text-vayro-danger',
  info: 'border-vayro-primary/40 bg-vayro-primary/10 text-vayro-primary',
  muted: 'border-vayro-border bg-vayro-surface text-vayro-muted',
};

export function Pill({ tone = 'info', children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Notice({ tone = 'danger', children, icon }: { tone?: 'danger' | 'success' | 'info'; children: React.ReactNode; icon?: string }) {
  const t = {
    danger: 'border-vayro-danger/40 bg-vayro-danger/10 text-vayro-text',
    success: 'border-vayro-success/40 bg-vayro-success/10 text-vayro-text',
    info: 'border-vayro-primary/30 bg-vayro-primary/10 text-vayro-text',
  }[tone];
  const c = { danger: 'text-vayro-danger', success: 'text-vayro-success', info: 'text-vayro-primary' }[tone];
  const ic = icon ?? { danger: 'warning', success: 'check', info: 'info' }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`mb-5 flex items-start gap-3 rounded-xl2 border p-4 text-sm leading-7 ${t}`}>
      <Icon name={ic} size={20} className={`mt-1 ${c}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-20 rounded-xl2 border border-vayro-border" />
      ))}
    </div>
  );
}

/** إشارة ثابتة لحالة التوثيق في أكثر من صفحة. */
export function KycPill({ status }: { status: string }) {
  const map: Record<string, { tone: keyof typeof TONES; label: string }> = {
    APPROVED: { tone: 'success', label: 'الهوية موثّقة' },
    PENDING: { tone: 'info', label: 'قيد المراجعة' },
    REJECTED: { tone: 'danger', label: 'مرفوض، أعد الإرسال' },
    NONE: { tone: 'muted', label: 'غير موثّق' },
  };
  const m = map[status] ?? map.NONE;
  return <Pill tone={m.tone}>{m.label}</Pill>;
}
