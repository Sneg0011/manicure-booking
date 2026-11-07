export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/(?!^)\+|[^\d+]/g, '');
  const digits = cleaned.replace(/^\+/, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && /^[78]/.test(digits)) return `+7${digits.slice(1)}`;
  return null;
}
