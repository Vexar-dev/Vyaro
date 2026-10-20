'use client';

import { useState } from 'react';

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-vayro-border overflow-hidden rounded-xl2 border border-vayro-border bg-vayro-card/60">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start font-semibold transition hover:bg-vayro-primary/10"
            >
              <span>{it.q}</span>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-vayro-primary/50 text-vayro-accent transition-transform ${isOpen ? 'rotate-45' : ''}`}>+</span>
            </button>
            <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-7 text-vayro-muted">{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
