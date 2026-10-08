export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatLocalDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} (${browserTimeZone()})`;
}

export function futureLocalDateTimeInput(minutes: number): string {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function localDateTimeInputToUtc(value: string): string {
  return new Date(value).toISOString();
}
