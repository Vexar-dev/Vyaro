'use client';

import { Icon, DrawCheck } from './Icon';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Item {
  id: number;
  kind: Kind;
  text: string;
}

const Ctx = createContext<{ toast: (text: string, kind?: Kind) => void } | null>(null);

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within <ToastProvider>');
  return v.toast;
}

const STYLE: Record<Kind, { ring: string; color: string }> = {
  success: { ring: 'border-vayro-success/40', color: 'text-vayro-success' },
  error: { ring: 'border-vayro-danger/40', color: 'text-vayro-danger' },
  info: { ring: 'border-vayro-primary/40', color: 'text-vayro-primary' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 4200);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[150] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {items.map((i) => (
          <div
            key={i.id}
            className={`pointer-events-auto flex max-w-sm animate-toast-in items-center gap-3 rounded-xl2 border bg-vayro-card/95 px-4 py-3 text-sm backdrop-blur ${STYLE[i.kind].ring}`}
          >
            <span className={STYLE[i.kind].color}>{i.kind === 'success' ? <DrawCheck size={22} /> : <Icon name={i.kind === 'error' ? 'error' : 'info'} size={22} />}</span>
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
