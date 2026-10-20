'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { LogoMark } from '../brand/Logo';

/**
 * بديل كامل لـ window.confirm / window.prompt / window.alert.
 * الاستعمال:
 *   const dlg = useDialog();
 *   if (await dlg.confirm({ title: 'تأكيد السحب', message: '...', tone: 'danger' })) { ... }
 *   const reason = await dlg.prompt({ title: 'سبب الإجراء', optional: true });  // string | null
 *   await dlg.alert({ title: 'تم', message: '...' });
 */
type Tone = 'default' | 'danger';

interface BaseOpts {
  title: string;
  message?: React.ReactNode;
  tone?: Tone;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
}
interface PromptOpts extends BaseOpts {
  label?: string;
  placeholder?: string;
  optional?: boolean;
  multiline?: boolean;
  initial?: string;
}

type Req =
  | { kind: 'confirm'; opts: BaseOpts; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: BaseOpts; resolve: () => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void };

interface Api {
  confirm: (o: BaseOpts) => Promise<boolean>;
  alert: (o: BaseOpts) => Promise<void>;
  prompt: (o: PromptOpts) => Promise<string | null>;
}

const Ctx = createContext<Api | null>(null);

export function useDialog(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialog must be used within <DialogProvider>');
  return v;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Req[]>([]);

  const api: Api = {
    confirm: (opts) => new Promise((resolve) => setQueue((q) => [...q, { kind: 'confirm', opts, resolve }])),
    alert: (opts) => new Promise((resolve) => setQueue((q) => [...q, { kind: 'alert', opts, resolve }])),
    prompt: (opts) => new Promise((resolve) => setQueue((q) => [...q, { kind: 'prompt', opts, resolve }])),
  };
  const apiRef = useRef(api);
  apiRef.current = api;
  // مرجع ثابت حتى لا تُعاد رسم المستهلكين عند كل تغيير
  const stable = useRef<Api>({
    confirm: (o) => apiRef.current.confirm(o),
    alert: (o) => apiRef.current.alert(o),
    prompt: (o) => apiRef.current.prompt(o),
  }).current;

  const current = queue[0];
  const close = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <Ctx.Provider value={stable}>
      {children}
      {current && <DialogView key={queue.length + current.opts.title} req={current} onDone={close} />}
    </Ctx.Provider>
  );
}

function DialogView({ req, onDone }: { req: Req; onDone: () => void }) {
  const { opts } = req;
  const tone: Tone = opts.tone ?? 'default';
  const danger = tone === 'danger';
  const [value, setValue] = useState(req.kind === 'prompt' ? req.opts.initial ?? '' : '');
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);

  const finish = useCallback(
    (ok: boolean) => {
      if (closing) return;
      setClosing(true);
      if (req.kind === 'confirm') req.resolve(ok);
      else if (req.kind === 'alert') req.resolve();
      else {
        if (!ok) req.resolve(null);
        else req.resolve(value.trim());
      }
      setTimeout(onDone, 140);
    },
    [closing, onDone, req, value],
  );

  function submit() {
    if (req.kind === 'prompt' && !req.opts.optional && !value.trim()) {
      setError('هذا الحقل مطلوب');
      return;
    }
    finish(true);
  }

  // تركيز + حبس التبويب + Esc + قفل التمرير
  useEffect(() => {
    prevFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = panel.current;
    const focusables = () =>
      Array.from(el?.querySelectorAll<HTMLElement>('button,textarea,input,[tabindex]:not([tabindex="-1"])') ?? []).filter(
        (n) => !n.hasAttribute('disabled'),
      );
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon = opts.icon ?? (danger ? 'warning' : req.kind === 'prompt' ? 'edit' : req.kind === 'alert' ? 'info' : 'shield-check');
  const confirmText = opts.confirmText ?? (req.kind === 'alert' ? 'حسناً' : 'تأكيد');
  const cancelText = opts.cancelText ?? 'إلغاء';

  return (
    <div
      className={`fixed inset-0 z-[200] grid place-items-center p-4 ${closing ? 'opacity-0 transition-opacity duration-150' : 'animate-fade-in'}`}
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onMouseDown={() => req.kind !== 'prompt' && finish(false)}
        aria-hidden
      />
      <div
        ref={panel}
        role={req.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby={opts.message ? 'dlg-msg' : undefined}
        className={`hud relative w-full max-w-md overflow-hidden p-0 shadow-crypt ${closing ? '' : 'animate-dlg-in'} ${
          danger ? '' : ''
        }`}
        style={{ borderColor: danger ? 'rgb(var(--danger) / .5)' : undefined }}
      >
        <div className="p-6">
          <div className="mb-4 flex items-center gap-4">
            <div
              className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full border ${
                danger ? 'border-vayro-danger/50 bg-vayro-danger/10 text-vayro-danger' : 'border-vayro-primary/40 bg-vayro-primary/10 text-vayro-primary'
              }`}
            >
              <Icon name={icon} size={26} className="relative" />
            </div>
            <h2 id="dlg-title" className="font-display text-xl font-bold leading-snug">
              {opts.title}
            </h2>
          </div>

          {opts.message && (
            <div id="dlg-msg" className="mb-4 text-sm leading-7 text-vayro-muted">
              {opts.message}
            </div>
          )}

          {req.kind === 'prompt' && (
            <div className="mb-4">
              {req.opts.label && <label className="mb-1.5 block text-xs font-medium text-vayro-muted">{req.opts.label}</label>}
              {req.opts.multiline ? (
                <textarea
                  data-autofocus
                  value={value}
                  rows={3}
                  placeholder={req.opts.placeholder}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  className="w-full resize-none rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-sm outline-none transition focus:border-vayro-primary"
                />
              ) : (
                <input
                  data-autofocus
                  value={value}
                  placeholder={req.opts.placeholder}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="w-full rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-sm outline-none transition focus:border-vayro-primary"
                />
              )}
              {error && <p className="mt-1.5 text-xs text-vayro-danger">{error}</p>}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
            {req.kind !== 'alert' && (
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-lg border border-vayro-border px-5 py-2.5 text-sm font-medium text-vayro-muted transition hover:border-vayro-muted hover:text-vayro-text"
              >
                {cancelText}
              </button>
            )}
            <button
              type="button"
              data-autofocus={req.kind !== 'prompt' ? true : undefined}
              onClick={submit}
              className={`rounded-lg px-6 py-2.5 text-sm font-bold text-white transition ${
                danger
                  ? 'bg-vayro-danger hover:brightness-110'
                  : 'btn-glow'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
        <LogoMark height={110} glow={false} className="pointer-events-none absolute -bottom-6 -start-6 opacity-[0.08]" />
      </div>
    </div>
  );
}
