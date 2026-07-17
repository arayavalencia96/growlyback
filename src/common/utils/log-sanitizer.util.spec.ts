import { sanitizeForLog } from './log-sanitizer.util';

describe('sanitizeForLog', () => {
  it('redacts authentication secrets recursively', () => {
    const result = sanitizeForLog({
      statuscode: 200,
      result: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          email: 'user@growly.com',
          passwordHash: 'hash',
        },
      },
    });

    expect(result).toEqual({
      statuscode: 200,
      result: {
        accessToken: '[REDACTED]',
        refreshToken: '[REDACTED]',
        user: {
          email: 'user@growly.com',
          passwordHash: '[REDACTED]',
        },
      },
    });
  });

  it('keeps non-sensitive result fields visible', () => {
    expect(
      sanitizeForLog({
        result: { id: 'goal-id', name: 'Auto nuevo' },
        ok: true,
      }),
    ).toEqual({
      result: { id: 'goal-id', name: 'Auto nuevo' },
      ok: true,
    });
  });
});
