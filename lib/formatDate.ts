// Single shared date/time formatter for the whole app — "Monday 10th August
// 2026, 8:17 PM". Deliberately avoids two failure modes that have already
// bitten this codebase (see the compact-currency hydration fixes in
// CommissionsPage/AccountingPage/ControlCentre):
//
// 1. No Intl-generated text (weekday/month names) — fixed local arrays
//    instead, so there's no ICU-version/locale disagreement between Node's
//    SSR pass and the browser's hydration pass.
// 2. A fixed timezone (Europe/London — this app's operating timezone: GBP,
//    en-GB conventions throughout) instead of each process's own "local"
//    time, which differs between wherever the server runs and wherever the
//    viewer's browser is — reading raw Date getters would render a
//    different hour (or even day) in SSR vs. hydration for the exact same
//    timestamp. Intl.DateTimeFormat().formatToParts() is used *only* to
//    pull the numeric Y/M/D/H/M fields for that named zone (a stable,
//    low-risk ICU feature, unlike text generation), which are then
//    assembled into the final string by hand.
//
// Weekday-from-date is computed with plain UTC arithmetic, not a locale
// feature, so it's deterministic everywhere too.

export const MONTH_NAMES = [
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
];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DISPLAY_TIME_ZONE = "Europe/London";
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function weekdayIndex(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function londonParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function datePart(year: number, month: number, day: number): string {
  return `${WEEKDAY_NAMES[weekdayIndex(year, month, day)]} ${ordinal(day)} ${MONTH_NAMES[month - 1]} ${year}`;
}

function timePart(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad2(minute)} ${ampm}`;
}

/**
 * "Monday 10th August 2026" — date portion only. A bare `date` value
 * ("2026-08-10", no time-of-day) is read literally with no timezone
 * conversion, since converting a value that has no time component could
 * shift the calendar date by a day depending on the viewer. Anything else
 * is treated as a real timestamp and converted to UK time first.
 */
export function formatDate(value: string): string {
  if (BARE_DATE_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return datePart(y ?? 1970, m ?? 1, d ?? 1);
  }
  const { year, month, day } = londonParts(new Date(value));
  return datePart(year, month, day);
}

/** "8:17 PM" — time portion only, converted to UK time. */
export function formatTime(value: string): string {
  const { hour, minute } = londonParts(new Date(value));
  return timePart(hour, minute);
}

/** "Monday 10th August 2026, 8:17 PM" — the app's one standard timestamp format. */
export function formatDateTime(value: string): string {
  const { year, month, day, hour, minute } = londonParts(new Date(value));
  return `${datePart(year, month, day)}, ${timePart(hour, minute)}`;
}

/**
 * "8:17 PM" from a bare `time` column ("14:17" or "14:17:00" — no date, no
 * timezone at all, e.g. enquiry_legs.pickup_time). Parsed directly from the
 * string, never through a Date object — there's no timezone to convert
 * since the value has no associated date/offset in the first place.
 */
export function formatTimeOnly(value: string): string {
  const [h, m] = value.split(":").map(Number);
  return timePart(h ?? 0, m ?? 0);
}

/**
 * Combines a bare `date` column with its sibling bare `time` column (this
 * app stores journey pickup/return date and time as two separate
 * timezone-naive columns, e.g. enquiry_legs.pickup_date/pickup_time) into
 * the one standard format. Falls back to the date alone if no time is set.
 */
export function formatDateAndTime(dateValue: string, timeValue: string | null | undefined): string {
  return timeValue ? `${formatDate(dateValue)}, ${formatTimeOnly(timeValue)}` : formatDate(dateValue);
}
