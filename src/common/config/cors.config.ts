const productionOrigin = 'https://growly-1a68d.web.app';

export function corsAllowedOrigins(
  value = process.env.CORS_ALLOWED_ORIGINS,
  nodeEnv = process.env.NODE_ENV,
): string[] {
  const configured = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured?.length) return [...new Set(configured)];

  return nodeEnv === 'production'
    ? [productionOrigin]
    : ['http://localhost:5173', productionOrigin];
}
