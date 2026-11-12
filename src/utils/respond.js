const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// DB rows use snake_case; the API speaks camelCase. Dates and other objects are left alone.
export function camelize(v) {
  if (Array.isArray(v)) return v.map(camelize);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [toCamel(k), camelize(val)]));
  }
  return v;
}

export const ok = (res, data, meta) =>
  res.json(meta ? { data: camelize(data), meta } : { data: camelize(data) });
export const created = (res, data) => res.status(201).json({ data: camelize(data) });
export const pageMeta = (page, pageSize, total) =>
  ({ page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
export const offsetOf = (page, pageSize) => (page - 1) * pageSize;
