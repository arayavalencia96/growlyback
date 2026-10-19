import { corsAllowedOrigins } from './cors.config';

describe('corsAllowedOrigins', () => {
  it('allows only the Growly production frontend in production', () => {
    expect(corsAllowedOrigins(undefined, 'production')).toEqual([
      'https://growly-1a68d.web.app',
    ]);
  });

  it('also allows Vite locally outside production', () => {
    expect(corsAllowedOrigins(undefined, 'development')).toEqual([
      'http://localhost:5173',
      'https://growly-1a68d.web.app',
    ]);
  });

  it('normalizes and deduplicates configured origins', () => {
    expect(
      corsAllowedOrigins(
        ' https://growly.example.com, http://localhost:5173,https://growly.example.com ',
        'production',
      ),
    ).toEqual(['https://growly.example.com', 'http://localhost:5173']);
  });
});
