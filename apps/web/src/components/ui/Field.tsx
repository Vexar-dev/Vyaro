'use client';

import { Icon } from './Icon';
import { forwardRef, useId, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  /** رسالة الخطأ المصمَّمة (بدل فقاعة المتصفح) */
  error?: string | null;
  hint?: string;
  /** يعرض زر إظهار/إخفاء لحقول كلمة السر */
  reveal?: boolean;
  /** إجبار الاتجاه LTR للأرقام والبريد والعناوين */
  ltr?: boolean;
};

/**
 * حقل مصمَّم. استخدمه داخل <form noValidate> وتحقّق بنفسك لتظهر رسائل
 * الخطأ بتصميم الموقع بدل فقاعة "Please fill out this field" الخاصة بالمتصفح.
 */
export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, error, hint, reveal, ltr, className = '', type, ...rest },
  ref,
) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPass = type === 'password';
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm text-vayro-muted">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPass && reveal && shown ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
          dir={ltr || (isPass && reveal) ? 'ltr' : undefined}
          className={`w-full rounded-lg border bg-vayro-surface px-4 py-2.5 text-vayro-text outline-none transition placeholder:text-vayro-muted/60 ${
            error ? 'border-vayro-danger focus:border-vayro-danger' : 'border-vayro-border hover:border-vayro-primary/50 focus:border-vayro-primary'
          } ${isPass && reveal ? 'pr-12' : ''} ${ltr || (isPass && reveal) ? 'text-left' : ''}`}
          {...rest}
        />
        {isPass && reveal && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-vayro-muted transition hover:text-vayro-accent"
          >
            <Icon name={shown ? 'eye-off' : 'eye'} size={18} />
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-e`} className="mt-1.5 flex items-center gap-1.5 text-xs text-vayro-danger">
          <Icon name="warning" size={14} />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-h`} className="mt-1.5 text-xs text-vayro-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
