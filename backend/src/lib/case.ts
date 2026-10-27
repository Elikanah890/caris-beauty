type Json = unknown;

export function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function camelize<T = unknown>(value: Json): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[toCamel(k)] = camelize(v);
    return out as T;
  }
  return value as T;
}

export function snakeize<T = unknown>(value: Json): T {
  if (Array.isArray(value)) return value.map((v) => snakeize(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[toSnake(k)] = snakeize(v);
    return out as T;
  }
  return value as T;
}
