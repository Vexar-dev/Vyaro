/* eslint-disable @next/next/no-img-element */

/**
 * اللوغو الرسمي: حرف V مع المدار والكرة الأرضية + كلمة VAYRO.
 * نسختان من الصورة (داكن/فاتح) تتبدّلان تلقائياً مع الثيم عبر CSS (.logo-dark / .logo-light).
 */
function Pair({ base, alt, className, style }: { base: string; alt: string; className?: string; style?: React.CSSProperties }) {
  // الداكن: نسخة برتقالية. الفاتح: النسخة البنفسجية الأصلية.
  return (
    <>
      <img src={`/brand/${base}-orange.png`} alt={alt} className={`logo-dark ${className ?? ''}`} style={style} draggable={false} />
      <img src={`/brand/${base}-light.png`} alt={alt} className={`logo-light ${className ?? ''}`} style={style} draggable={false} />
    </>
  );
}

/** علامة V (نسبة العرض/الارتفاع ≈ 1.66) — حدّد الارتفاع بالبكسل */
export function LogoMark({ height = 40, className = '', glow = true }: { height?: number; className?: string; glow?: boolean }) {
  return (
    <Pair
      base="vayro-mark"
      alt="VAYRO"
      className={`select-none ${glow ? 'logo-glow' : ''} ${className}`}
      style={{ height, width: 'auto' }}
    />
  );
}

/** كلمة VAYRO بخطها الخاص (نسبة ≈ 4.9) */
export function Wordmark({ height = 22, className = '' }: { height?: number; className?: string }) {
  return <Pair base="vayro-wordmark" alt="VAYRO" className={`select-none ${className}`} style={{ height, width: 'auto' }} />;
}
