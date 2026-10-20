'use client';

import { useEffect, useRef, useState } from 'react';

/** يُظهر العنصر بحركة ناعمة عند دخوله الشاشة. delay بالميلي ثانية لترتيب العناصر المتجاورة. */
export function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${on ? 'is-in' : ''} ${className}`} style={{ ['--d' as string]: `${delay}ms` }}>{children}</div>;
}
