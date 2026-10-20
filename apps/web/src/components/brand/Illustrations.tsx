import { useId } from 'react';

/** رسومات أصلية (SVG) بألوان الثيم — تتبدّل تلقائياً بين الداكن والفاتح. */

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="rgb(var(--glow))" />
        <stop offset="1" stopColor="rgb(var(--accent))" />
      </linearGradient>
      <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgb(var(--card))" />
        <stop offset="1" stopColor="rgb(var(--surface))" />
      </linearGradient>
      <radialGradient id={`h${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="rgb(var(--glow))" stopOpacity=".55" />
        <stop offset="1" stopColor="rgb(var(--glow))" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

const ink = 'rgb(var(--text))';
const mute = 'rgb(var(--muted))';
const line = 'rgb(var(--border))';

/** عناوين الإيداع: بطاقة عنوان + QR + شبكات */
export function WalletArt({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  // QR وهمي ثابت (نمط زخرفي، ليس رمزاً حقيقياً)
  const cells: [number, number][] = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if ((x * 7 + y * 13 + x * y) % 3 === 0 || (x < 3 && y < 3)) cells.push([x, y]);
  return (
    <svg viewBox="0 0 420 320" className={className} role="img" aria-label="رسم: بطاقة عنوان إيداع مع شبكات الدفع">
      <Defs id={id} />
      <circle cx="210" cy="160" r="150" fill={`url(#h${id})`} />
      {/* حلقات */}
      <ellipse cx="210" cy="178" rx="185" ry="52" fill="none" stroke={line} strokeDasharray="3 7" />
      <ellipse cx="210" cy="178" rx="140" ry="36" fill="none" stroke="rgb(var(--primary))" strokeOpacity=".4" />
      {/* البطاقة */}
      <g transform="rotate(-6 210 150)">
        <rect x="70" y="60" width="280" height="168" rx="18" fill={`url(#p${id})`} stroke={`url(#g${id})`} strokeWidth="1.6" />
        <rect x="70" y="60" width="280" height="38" rx="18" fill={`url(#g${id})`} opacity=".16" />
        <circle cx="96" cy="79" r="7" fill={`url(#g${id})`} />
        <text x="112" y="84" fontSize="13" fill={ink} fontFamily="'Reem Kufi',sans-serif">عنوان الإيداع</text>
        <g transform="translate(92 114)">
          {cells.map(([x, y], i) => (
            <rect key={i} x={x * 8} y={y * 8} width="6.4" height="6.4" rx="1.2" fill={ink} opacity={0.85} />
          ))}
        </g>
        <g fontFamily="'JetBrains Mono Variable',monospace" fontSize="11" fill={mute}>
          <text x="186" y="130">TQn9•••••••••••••k7Zs</text>
          <rect x="186" y="142" width="132" height="8" rx="4" fill={line} />
          <rect x="186" y="158" width="94" height="8" rx="4" fill={line} />
        </g>
        <rect x="186" y="184" width="62" height="24" rx="12" fill="rgb(var(--primary))" opacity=".25" stroke="rgb(var(--primary))" />
        <text x="217" y="200" fontSize="11" textAnchor="middle" fill={ink}>نسخ</text>
      </g>
      {/* رقائق الشبكات */}
      {[
        { x: 28, y: 232, t: 'BEP-20' },
        { x: 168, y: 262, t: 'TRC-20' },
        { x: 306, y: 226, t: 'LTC' },
      ].map((c) => (
        <g key={c.t} className="animate-drift" style={{ animationDelay: `${c.x}ms` }}>
          <rect x={c.x} y={c.y} width="86" height="30" rx="15" fill={`url(#p${id})`} stroke="rgb(var(--primary))" strokeOpacity=".7" />
          <circle cx={c.x + 16} cy={c.y + 15} r="4.5" fill={`url(#g${id})`} />
          <text x={c.x + 56} y={c.y + 19.5} textAnchor="middle" fontSize="12" fill={ink} fontFamily="'JetBrains Mono Variable',monospace">{c.t}</text>
        </g>
      ))}
    </svg>
  );
}

/** المتجر: رفّ منتجات رقمية */
export function StoreArt({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 420 320" className={className} role="img" aria-label="رسم: متجر رقمي بمنتجات متنوعة">
      <Defs id={id} />
      <circle cx="210" cy="150" r="150" fill={`url(#h${id})`} />
      {/* واجهة المتجر */}
      <path d="M52 108 L76 52 H344 L368 108Z" fill={`url(#g${id})`} opacity=".9" />
      {Array.from({ length: 6 }).map((_, i) => (
        <path key={i} d={`M${52 + i * 52.7} 108 q 26.3 24 52.7 0`} fill={i % 2 ? 'rgb(var(--primaryDark))' : 'rgb(var(--accent))'} opacity=".95" />
      ))}
      <rect x="62" y="116" width="296" height="150" rx="10" fill={`url(#p${id})`} stroke={line} />
      {/* رف */}
      <rect x="62" y="196" width="296" height="6" fill={line} />
      {/* بطاقات المنتجات */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${86 + i * 98} 128)`}>
          <rect width="78" height="60" rx="10" fill="rgb(var(--surface))" stroke="rgb(var(--primary))" strokeOpacity=".6" />
          {i === 0 && (
            <g fill="none" stroke={`url(#g${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="30" cy="30" r="9" />
              <path d="M38 36 L56 52 M50 46 l6 -6 M45 41 l5 -5" transform="translate(-2 -6)" />
            </g>
          )}
          {i === 1 && (
            <g fill="none" stroke={`url(#g${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="18" y="20" width="42" height="26" rx="8" />
              <path d="M30 33h8M34 29v8M48 31h.1M52 36h.1" />
            </g>
          )}
          {i === 2 && (
            <g fill="none" stroke={`url(#g${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="20" y="28" width="38" height="24" rx="3" />
              <path d="M20 36h38M39 28v24M39 28c-8-14-18-4-8 0M39 28c8-14 18-4 8 0" />
            </g>
          )}
          <rect x="10" y="48" width="38" height="5" rx="2.5" fill={line} />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${86 + i * 98} 208)`}>
          <rect width="78" height="44" rx="10" fill="rgb(var(--surface))" stroke={line} />
          <rect x="10" y="12" width="44" height="6" rx="3" fill={line} />
          <rect x="10" y="26" width="26" height="6" rx="3" fill="rgb(var(--primary))" opacity=".6" />
        </g>
      ))}
      {/* لافتة */}
      <rect x="150" y="280" width="120" height="26" rx="13" fill={`url(#p${id})`} stroke="rgb(var(--accent))" />
      <text x="210" y="297" textAnchor="middle" fontSize="13" fill={ink} fontFamily="'Reem Kufi',sans-serif">متجر VAYRO</text>
    </svg>
  );
}

/** التوثيق: بطاقة هوية + إطار مسح */
export function KycArt({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 420 320" className={className} role="img" aria-label="رسم: توثيق الهوية بمسح بطاقة">
      <Defs id={id} />
      <circle cx="210" cy="160" r="150" fill={`url(#h${id})`} />
      <rect x="82" y="62" width="256" height="170" rx="16" fill={`url(#p${id})`} stroke={line} />
      {/* صورة شخصية */}
      <rect x="104" y="92" width="76" height="92" rx="10" fill="rgb(var(--surface))" stroke="rgb(var(--primary))" strokeOpacity=".6" />
      <circle cx="142" cy="127" r="16" fill={`url(#g${id})`} opacity=".85" />
      <path d="M112 184 q 30 -44 60 0Z" fill={`url(#g${id})`} opacity=".7" />
      {/* أسطر */}
      <rect x="198" y="96" width="112" height="9" rx="4.5" fill={ink} opacity=".75" />
      <rect x="198" y="116" width="86" height="7" rx="3.5" fill={line} />
      <rect x="198" y="134" width="100" height="7" rx="3.5" fill={line} />
      <rect x="198" y="152" width="64" height="7" rx="3.5" fill={line} />
      <rect x="104" y="200" width="206" height="7" rx="3.5" fill={line} />
      {/* إطار المسح */}
      <g fill="none" stroke="rgb(var(--accent))" strokeWidth="4" strokeLinecap="round">
        <path d="M62 96 V62 a8 8 0 0 1 8 -8 H104" />
        <path d="M358 96 V62 a8 8 0 0 0 -8 -8 H316" />
        <path d="M62 198 v34 a8 8 0 0 0 8 8 H104" />
        <path d="M358 198 v34 a8 8 0 0 1 -8 8 H316" />
      </g>
      <rect x="70" y="140" width="280" height="3" fill="rgb(var(--accent))" opacity=".9">
        <animate attributeName="y" values="70;225;70" dur="4.5s" repeatCount="indefinite" />
      </rect>
      <rect x="70" y="120" width="280" height="40" fill={`url(#g${id})`} opacity=".08">
        <animate attributeName="y" values="62;205;62" dur="4.5s" repeatCount="indefinite" />
      </rect>
      {/* ختم التحقق */}
      <g transform="translate(300 214)">
        <circle r="30" fill="rgb(var(--bg))" stroke="rgb(var(--success))" strokeWidth="3" />
        <path d="M-12 1 l8 9 l17 -19" fill="none" stroke="rgb(var(--success))" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** الحماية: درع + قفل + حلقات */
export function ShieldArt({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 420 320" className={className} role="img" aria-label="رسم: درع حماية بقفل">
      <Defs id={id} />
      <circle cx="210" cy="160" r="150" fill={`url(#h${id})`} />
      <g fill="none" stroke="rgb(var(--primary))" strokeOpacity=".45">
        <circle cx="210" cy="160" r="128" strokeDasharray="2 8" />
        <circle cx="210" cy="160" r="102" />
      </g>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={210 + 128 * Math.cos((a * Math.PI) / 180)} cy={160 + 128 * Math.sin((a * Math.PI) / 180)} r="5" fill={`url(#g${id})`} />
      ))}
      <path
        d="M210 56 L310 92 V162 C310 222 266 262 210 282 C154 262 110 222 110 162 V92Z"
        fill={`url(#p${id})`}
        stroke={`url(#g${id})`}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M210 76 L292 105 V162 C292 211 257 244 210 262 C163 244 128 211 128 162 V105Z" fill="none" stroke={line} />
      {/* قفل */}
      <rect x="176" y="150" width="68" height="56" rx="10" fill={`url(#g${id})`} />
      <path d="M190 150 v-16 a20 20 0 0 1 40 0 v16" fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" />
      <circle cx="210" cy="172" r="8" fill="rgb(var(--bg))" />
      <rect x="206.5" y="174" width="7" height="18" rx="3.5" fill="rgb(var(--bg))" />
    </svg>
  );
}
