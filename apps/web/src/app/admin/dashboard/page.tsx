export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen p-10">
      <h1 className="mb-2 text-2xl font-bold">لوحة تحكم VAYRO</h1>
      <p className="mb-8 text-vayro-muted">
        هذه واجهة أساسية فقط لهذه المرحلة. لوحة التحكم الكاملة (Users, Providers, Fees,
        Limits, Exchange Rates...) تُبنى في Phase 9، بعد اكتمال الوحدات التي تعتمد عليها.
      </p>
      <div className="rounded-xl2 border border-vayro-border bg-vayro-card p-6 text-sm text-vayro-muted">
        الوصول لهذه الصفحة محمي فعليًا عبر RolesGuard على مستوى الـ API (ADMIN/SUPER_ADMIN/SUPPORT فقط)
        — وليس فقط عبر التحقق في الواجهة.
      </div>
    </main>
  );
}
