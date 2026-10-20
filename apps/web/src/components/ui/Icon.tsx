import type { SVGProps } from 'react';

/**
 * أيقونات خطية مرسومة بالكود (SVG) — بديل كامل للإيموجي. كلها على شبكة 24×24،
 * بخط موحّد السماكة وأطراف دائرية، وتأخذ لون النص الحالي (currentColor).
 */
const P: Record<string, React.ReactNode> = {
  home: (<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>),
  download: (<><path d="M12 4v10" /><path d="m8 10.5 4 4 4-4" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>),
  upload: (<><path d="M12 15V5" /><path d="m8 8.5 4-4 4 4" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>),
  cart: (<><path d="M3 4h2.2l2 11h10.3l2-8H6.3" /><circle cx="9" cy="19.2" r="1.4" /><circle cx="17" cy="19.2" r="1.4" /></>),
  id: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.2c.6-1.6 1.9-2.4 3.2-2.4s2.6.8 3.2 2.4" /><path d="M15 10h3.5M15 13.5h3.5" /></>),
  shield: (<><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V6z" /></>),
  'shield-check': (<><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V6z" /><path d="m9 12 2.2 2.2L15.2 10" /></>),
  devices: (<><rect x="7" y="3" width="10" height="18" rx="2.2" /><path d="M10.8 18h2.4" /></>),
  news: (<><rect x="4" y="4" width="16" height="16" rx="2.2" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>),
  gift: (<><rect x="4" y="9.5" width="16" height="10.5" rx="1.6" /><rect x="3" y="6.5" width="18" height="3" rx="1" /><path d="M12 6.5V20" /><path d="M12 6.5C10 6.5 8.2 5.8 8.2 4.4 8.2 3.5 9 3 9.8 3 11 3 12 4.6 12 6.5Zm0 0c0-1.9 1-3.5 2.2-3.5.8 0 1.6.5 1.6 1.4 0 1.4-1.8 2.1-3.8 2.1Z" /></>),
  crown: (<><path d="M4 19h16" /><path d="m4.5 17.5-1-9 5 4 3.5-6 3.5 6 5-4-1 9z" /></>),
  store: (<><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.6 2.6 0 0 0 5.3 0 2.6 2.6 0 0 0 5.4 0 2.6 2.6 0 0 0 5.3 0" /><path d="M5.5 12.5V20h13v-7.5" /><path d="M10 20v-4.5h4V20" /></>),
  logout: (<><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10" /><path d="m14 8 4 4-4 4" /><path d="M18 12H9" /></>),
  menu: (<path d="M4 7h16M4 12h16M4 17h16" />),
  close: (<path d="m6 6 12 12M18 6 6 18" />),
  check: (<path d="m5 12.5 4.5 4.5L19 7.5" />),
  copy: (<><rect x="8" y="8" width="11.5" height="11.5" rx="2" /><path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8" /></>),
  warning: (<><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r=".6" fill="currentColor" /></>),
  error: (<><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  key: (<><circle cx="8" cy="15" r="4" /><path d="m11 12.2 9-8.2M17 7l2.5 2.5M14.6 9.4 17 12" /></>),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>),
  'eye-off': (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></>),
  users: (<><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.5-3.2 3-5 6-5s5.5 1.8 6 5" /><path d="M16 5.6a3.2 3.2 0 0 1 0 6" /><path d="M18 14.4c1.8.6 2.7 2.2 3 4.6" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>),
  trash: (<><path d="M4 7h16M10 7V4.5h4V7" /><path d="M6 7l1 12.5h10L18 7" /><path d="M10 11v5M14 11v5" /></>),
  edit: (<><path d="M4 20h4l11-11-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>),
  image: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></>),
  settings: (<><path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h3M11 12h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /><circle cx="9" cy="12" r="2" /></>),
  swap: (<><path d="M4 8h13" /><path d="m14 4.5 3.5 3.5-3.5 3.5" /><path d="M20 16H7" /><path d="m10 12.5-3.5 3.5L10 19.5" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>),
  hourglass: (<><path d="M7 3.5h10M7 20.5h10" /><path d="M8 3.5c0 4 4 4.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 4.5-4 8.5s4 4.5 4 8.5" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1" /></>),
  chart: (<><path d="M4 20h16" /><path d="M7 20v-6M12 20V8M17 20v-9" /></>),
  tag: (<><path d="M3.5 12.2V4.5h7.7l9 9a1.5 1.5 0 0 1 0 2.1l-5.6 5.6a1.5 1.5 0 0 1-2.1 0Z" /><circle cx="8" cy="8.5" r="1.2" /></>),
  box: (<><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>),
  refresh: (<><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4.5V9h-4.5" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" /></>),
  moon: (<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />),
  plug: (<><path d="M9 3v5M15 3v5" /><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0Z" /><path d="M12 16.5V21" /></>),
  send: (<><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5Z" /></>),
  chat: (<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5Z" />),
  phone: (<path d="M6.6 3.5 9 3l1.7 4-1.9 1.3a10 10 0 0 0 4.9 4.9l1.4-1.9 4 1.7-.5 2.4a2.5 2.5 0 0 1-2.4 2.1A12.7 12.7 0 0 1 4.5 6a2.5 2.5 0 0 1 2.1-2.5Z" />),
  camera: (<><rect x="3.5" y="7" width="17" height="12.5" rx="2.4" /><path d="M8.5 7 10 4.5h4L15.5 7" /><circle cx="12" cy="13" r="3.3" /></>),
  instagram: (<><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.2" r=".7" fill="currentColor" /></>),
  facebook: (<path d="M14 8.2h2.5V4.5H14A3.6 3.6 0 0 0 10.4 8v2H8v3.6h2.4V20H14v-6.4h2.5l.5-3.6h-3V8.6c0-.2.1-.4.4-.4Z" />),
  x: (<path d="M5 4.5 19 19.5M19 4.5 5 19.5" />),
  youtube: (<><rect x="3" y="6" width="18" height="12" rx="4" /><path d="M10.5 9.6v4.8l4.2-2.4Z" /></>),
  tiktok: (<><path d="M13 4v10.5a3.2 3.2 0 1 1-3.2-3.2" /><path d="M13 4c.4 2.4 2 4 4.5 4.2" /></>),
  mail: (<><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="m4 7.5 8 5.8 8-5.8" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" /></>),
  'arrow-left': (<><path d="M20 12H5" /><path d="m11 6-6 6 6 6" /></>),
  'arrow-right': (<><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>),
  'arrow-up-right': (<><path d="M7 17 17 7" /><path d="M8.5 7H17v8.5" /></>),
  'arrow-down-left': (<><path d="M17 7 7 17" /><path d="M15.5 17H7V8.5" /></>),
  'chevron-down': (<path d="m6 9.5 6 6 6-6" />),
  file: (<><path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20Z" /><path d="M14 3.5V8h4M9 13h6M9 16.5h6" /></>),
  'upload-cloud': (<><path d="M7 18a4.5 4.5 0 0 1-.6-8.9A6 6 0 0 1 18 10a4 4 0 0 1-.5 8" /><path d="M12 12.5V20M9 15l3-3 3 3" /></>),
  bolt: (<path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" />),
  block: (<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>),
  user: (<><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.6-3.6 3.5-5.6 7-5.6s6.4 2 7 5.6" /></>),
  dot: (<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />),
  diamond: (<path d="m12 4 7 8-7 8-7-8Z" />),
  coin: (<><circle cx="12" cy="12" r="8.5" /><path d="M9.5 14.5c.6.9 1.5 1.3 2.7 1.3 1.4 0 2.3-.6 2.3-1.7 0-2.3-5-1.2-5-3.6 0-1 .9-1.7 2.3-1.7 1.1 0 2 .4 2.6 1.2M12 6.8v1.3M12 15.8v1.4" /></>),
  game: (<><rect x="3" y="7.5" width="18" height="10" rx="4" /><path d="M8 10.5v4M6 12.5h4" /><circle cx="15.5" cy="11.5" r=".8" fill="currentColor" /><circle cx="17.5" cy="13.5" r=".8" fill="currentColor" /></>),
};

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P);

export function Icon({ name, size = 20, className = '', ...rest }: { name: IconName | string; size?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const body = P[name] ?? P.dot;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {body}
    </svg>
  );
}

/** علامة صح تُرسَم بحركة (للنجاح). */
export function DrawCheck({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" className="draw-ring" />
      <path d="m7.8 12.4 3 3 5.6-6.2" className="draw-tick" />
    </svg>
  );
}

/** دوّامة تحميل. */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={`animate-spin ${className}`} aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" opacity=".9" />
    </svg>
  );
}
