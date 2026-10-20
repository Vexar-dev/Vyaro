/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { mediaUrl } from '@/lib/media';
import { Icon } from './Icon';

interface Props {
  image?: string | null;
  title: string;
  /** سطر صغير فوق العنوان (القسم أو التاريخ) */
  label?: string;
  href?: string;
  onClick?: () => void;
  fallbackIcon?: string;
  priority?: boolean;
}

/** بطاقة صورة طولية: الصورة بالكامل، وتدرّج داكن أسفلها يحمل العنوان. */
export function Poster({ image, title, label, href, onClick, fallbackIcon = 'game' }: Props) {
  const inner = (
    <>
      <div className="relative aspect-[3/4] w-full">
        {image ? (
          <img src={mediaUrl(image)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-vayro-muted">
            <Icon name={fallbackIcon} size={44} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-4">
          {label && (
            <p className="mb-1 flex items-center gap-2 text-xs text-white/70">
              <span className="h-3.5 w-1 rounded-sm bg-vayro-primary" aria-hidden />
              {label}
            </p>
          )}
          <h3 className="text-lg font-bold leading-snug text-white">{title}</h3>
        </div>
      </div>
    </>
  );
  const cls = 'poster w-full';
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
