export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl2 border border-vayro-border bg-vayro-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-vayro-text">
            VAYRO
          </h1>
          <p className="mt-2 text-lg font-semibold text-vayro-text">{title}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function TextField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="mb-4 block text-sm text-vayro-muted">
      {label}
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-vayro-border bg-vayro-surface px-4 py-2.5 text-vayro-text outline-none focus:border-vayro-primary"
      />
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-2 w-full rounded-lg btn-glow py-2.5 font-semibold text-white transition hover:opacity-90"
    >
      {children}
    </button>
  );
}
