export function currentRecordDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function newRecordDate(value?: string): Date {
  const now = new Date();
  if (!value || value === currentRecordDay(now)) return now;
  return new Date(value);
}
