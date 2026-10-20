'use client';

import { Icon } from './Icon';
import { useEffect, useId, useRef, useState } from 'react';

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/**
 * بديل <select> الأصلي (اللي بيفتح قائمة المتصفح). قائمة مصمّمة بالكامل،
 * تدعم لوحة المفاتيح (أسهم/Enter/Space/Esc/حروف) وقارئات الشاشة (listbox).
 */
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'اختر...',
  className = '',
  compact = false,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openMenu() {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function pick(i: number) {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.trim().toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      {label && (
        <label id={`${id}-l`} className="mb-1.5 block text-sm text-vayro-muted">
          {label}
        </label>
      )}
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={label ? `${id}-l` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-vayro-surface text-start text-vayro-text outline-none transition ${
          compact ? 'px-3 py-2 text-sm' : 'px-4 py-2.5'
        } ${open ? 'border-vayro-primary' : 'border-vayro-border hover:border-vayro-primary/60'} disabled:opacity-50`}
      >
        <span className={selected ? '' : 'text-vayro-muted/70'}>{selected?.label ?? placeholder}</span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-vayro-primary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-64 animate-pop-in overflow-auto rounded-xl2 border border-vayro-primary/50 bg-vayro-card p-1.5"
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <li
                key={o.value}
                data-i={i}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  i === active ? 'bg-vayro-primary/20 text-vayro-text' : 'text-vayro-muted'
                } ${isSel ? 'font-semibold !text-vayro-text' : ''}`}
              >
                <span>
                  {o.label}
                  {o.hint && <span className="ms-2 text-xs text-vayro-muted">{o.hint}</span>}
                </span>
                {isSel && <Icon name="check" size={16} className="text-vayro-primary" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
