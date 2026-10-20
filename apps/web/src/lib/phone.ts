/**
 * تطبيع رقم الهاتف إلى صيغة دولية (E.164).
 * يقبل: 09xxxxxxxx | 9639xxxxxxxx | +9639xxxxxxxx | 009639xxxxxxxx | أي رقم دولي +XXXXXXXX
 * يرجع null إذا غير صالح.
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (/^09\d{8}$/.test(s)) return `+963${s.slice(1)}`;
  if (/^9639\d{8}$/.test(s)) return `+${s}`;
  if (/^00\d{8,15}$/.test(s)) return `+${s.slice(2)}`;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

/** عرض محلي للأرقام السورية: +963933123456 -> 0933123456 */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  return /^\+9639\d{8}$/.test(e164) ? `0${e164.slice(4)}` : e164;
}

/** سيرياتيل: 093 / 098 / 099 (للتنبيه فقط، لا يمنع التسجيل) */
export function looksSyriatel(e164: string | null | undefined): boolean {
  return !!e164 && /^\+963(93|98|99)\d{7}$/.test(e164);
}
