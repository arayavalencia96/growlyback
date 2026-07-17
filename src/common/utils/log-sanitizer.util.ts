const REDACTED = '[REDACTED]';
const CIRCULAR = '[CIRCULAR]';
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 30;
const MAX_STRING_LENGTH = 2_000;

const SENSITIVE_KEYS = new Set([
  'authorization',
  'code',
  'cookie',
  'jwtaccesssecret',
  'jwtrefreshsecret',
  'verificationcode',
  'verificationcodehash',
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);

  return (
    SENSITIVE_KEYS.has(normalizedKey) ||
    normalizedKey.includes('password') ||
    normalizedKey.includes('secret') ||
    normalizedKey.endsWith('token')
  );
}

function sanitizeString(value: string): string {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : value.slice(0, MAX_STRING_LENGTH) + '...[TRUNCATED]';
}

function sanitizeObject(
  value: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : sanitizeForLog(item, depth + 1, seen),
    ]),
  );
}

export function sanitizeForLog(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error)
    return { name: value.name, message: value.message };
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (typeof value !== 'object') return '[UNSUPPORTED]';
  if (seen.has(value)) return CIRCULAR;

  seen.add(value);

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForLog(item, depth + 1, seen));

    if (value.length > MAX_ARRAY_ITEMS) sanitized.push('[TRUNCATED]');
    return sanitized;
  }

  return sanitizeObject(value as Record<string, unknown>, depth, seen);
}
