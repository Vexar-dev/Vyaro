'use client';

import { usePosts } from '@/lib/site-content';
import { mediaUrl } from '@/lib/media';
import { useDialog } from '@/components/ui/DialogProvider';
import { Poster } from '@/components/ui/Poster';
import { Reveal } from '@/components/ui/Reveal';
import { EmptyState, Skeleton } from '@/components/ui/PageHeader';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

export default function OffersPage() {
  const dlg = useDialog();
  const posts = usePosts('OFFER');

  const open = (id: string) => {
    const p = posts?.find((x) => x.id === id);
    if (!p) return;
    dlg.alert({
      title: p.title,
      icon: 'gift',
      confirmText: 'إغلاق',
      message: (
        <div>
          {p.imageUrl && <img src={mediaUrl(p.imageUrl)} alt="" className="mb-4 max-h-80 w-full rounded-lg object-cover" />}
          <p className="whitespace-pre-line leading-8">{p.body}</p>
        </div>
      ),
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <h1 className="mb-8 text-3xl font-bold md:text-4xl">العروض</h1>
      {posts === null ? (
        <Skeleton rows={3} />
      ) : posts.length === 0 ? (
        <EmptyState icon="gift" title="لا توجد عروض حالياً" />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {posts.map((p, i) => (
            <Reveal key={p.id} delay={(i % 5) * 70}>
              <Poster image={p.imageUrl} title={p.title} label={p.excerpt ?? fmt(p.publishedAt)} onClick={() => open(p.id)} fallbackIcon="gift" />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
