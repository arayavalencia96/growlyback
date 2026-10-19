import { currentRecordDay, newRecordDate } from './record-date';

describe('record date', () => {
  it('uses the Buenos Aires calendar day', () => {
    expect(currentRecordDay(new Date('2026-10-01T02:30:00.000Z'))).toBe(
      '2026-09-30',
    );
  });

  it('keeps an explicitly selected historic day', () => {
    expect(newRecordDate('2026-01-15').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
  });
});
