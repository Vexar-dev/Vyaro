/** Normalizes a phone number to E.164. Mirrors apps/web/src/lib/phone.ts. Returns null if invalid. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[\s\-().]/g, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (/^09\d{8}$/.test(s)) return `+963${s.slice(1)}`;
  if (/^9639\d{8}$/.test(s)) return `+${s}`;
  if (/^00[1-9]\d{7,14}$/.test(s)) return `+${s.slice(2)}`;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}

/** TSA APIs take the local Syrian form (09xxxxxxxx). Falls back to the E.164 value unchanged. */
export function toLocalSyrian(e164: string): string {
  return /^\+9639\d{8}$/.test(e164) ? `0${e164.slice(4)}` : e164;
}
