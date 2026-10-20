import Link from 'next/link';
import { Spinner } from './Icon';

type Variant = 'primary' | 'ghost' | 'danger';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:pointer-events-none';
const SIZE = { md: 'px-5 py-2.5 text-sm', lg: 'px-8 py-3.5 text-base', sm: 'px-3 py-1.5 text-xs' };
const VARIANT: Record<Variant, string> = {
  primary: 'btn-glow',
  ghost: 'border border-vayro-border bg-vayro-card/40 text-vayro-text hover:border-vayro-primary/70',
  danger: 'border border-vayro-danger/40 bg-vayro-danger/10 text-vayro-danger hover:bg-vayro-danger/20',
};

interface Common {
  variant?: Variant;
  size?: keyof typeof SIZE;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  ...rest
}: Common & { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: Common & { href: string }) {
  return (
    <Link href={href} className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}
