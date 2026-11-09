/** Date helpers. Transaction dates are calendar dates (no timezone shift). */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toISODate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatDate(value: string): string {
  const date = parseISODate(value);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateShort(value: string): string {
  const date = parseISODate(value);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(iso);
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function currentPeriod(reference = new Date()): { month: number; year: number } {
  return { month: reference.getMonth() + 1, year: reference.getFullYear() };
}

export function shiftMonth(
  month: number,
  year: number,
  delta: number,
): { month: number; year: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export function monthLabel(month: number, year: number, short = false): string {
  return `${(short ? MONTHS_SHORT : MONTHS_LONG)[month - 1]} ${year}`;
}

export function lastNMonths(count: number, reference = new Date()): Array<{
  month: number;
  year: number;
  label: string;
  shortLabel: string;
}> {
  const result = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - offset, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    result.push({
      month,
      year,
      label: monthLabel(month, year),
      shortLabel: MONTHS_SHORT[month - 1],
    });
  }
  return result;
}

export function lastNDays(count: number, reference = new Date()): Array<{
  date: string;
  label: string;
  dayNumber: number;
}> {
  const result = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - offset);
    result.push({
      date: toISODate(date),
      label: WEEKDAYS[date.getDay()],
      dayNumber: date.getDate(),
    });
  }
  return result;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isInMonth(isoDate: string, month: number, year: number): boolean {
  return isoDate.startsWith(monthKey(year, month));
}

export function isWithinRange(isoDate: string, start: string, end: string): boolean {
  if (start && isoDate < start) return false;
  if (end && isoDate > end) return false;
  return true;
}

export function nowISO(): string {
  return new Date().toISOString();
}
