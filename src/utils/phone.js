// Normalises Nigerian numbers to +234XXXXXXXXXX. Returns null when invalid.
export function normalizeNgPhone(input) {
  const v = String(input ?? '').replace(/[\s()-]/g, '');
  if (/^\+234\d{10}$/.test(v)) return v;
  if (/^234\d{10}$/.test(v)) return `+${v}`;
  if (/^0\d{10}$/.test(v)) return `+234${v.slice(1)}`;
  return null;
}
