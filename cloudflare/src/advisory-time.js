/** Generic temporal vocabulary for advisory evidence. All dates are ART. */
export const ADVISORY_TIME_ZONE = "America/Argentina/Buenos_Aires";
export const DAY_PARTS = [
  { id: "dawn", startHour: 0, endHour: 5 },
  { id: "morning", startHour: 6, endHour: 11 },
  { id: "afternoon", startHour: 12, endHour: 17 },
  { id: "night", startHour: 18, endHour: 23 }
];

function timestamp(value) {
  const parsed = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalizes Meteored's one-hour intervals for advisory-only consumers.
 * Current payloads expose `end`; an explicit per-slot `start` is preferred
 * when it is internally consistent.  This mirrors the v1.13.5 temporal
 * contract without making any network request.
 */
export function hourlyIntervalStart(hour) {
  const start = timestamp(hour?.start); const end = timestamp(hour?.end);
  if (start !== null) return end === null || end - start === 60 * 60 * 1000 ? start : null;
  return end === null ? null : end - 60 * 60 * 1000;
}

export function localDateTimeParts(value) {
  const parsed = timestamp(value);
  if (parsed === null) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: ADVISORY_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(parsed)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { ...parts, hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Returns the stable internal day-part identifier for one valid instant. */
export function getDayPartForLocalTime(value) {
  const parts = localDateTimeParts(value);
  if (!parts) return null;
  return DAY_PARTS.find((part) => parts.hour >= part.startHour && parts.hour <= part.endHour)?.id || null;
}

/**
 * Splits an [startsAt, endsAt) interval by local calendar date and day part.
 * The interval is evidence metadata, not a meteorological rule.
 */
export function getDayPartsForInterval(startsAt, endsAt) {
  const start = timestamp(startsAt); const end = timestamp(endsAt);
  if (start === null || end === null || end <= start) return [];
  const groups = new Map();
  // Sampling each UTC hour is safe in ART (UTC-3, no DST) and preserves an
  // interval beginning in the middle of a local hour.
  for (let cursor = start; cursor < end; cursor += 60 * 60 * 1000) {
    const parts = localDateTimeParts(cursor);
    const dayPart = getDayPartForLocalTime(cursor);
    if (!parts || !dayPart) continue;
    if (!groups.has(parts.date)) groups.set(parts.date, []);
    const items = groups.get(parts.date);
    if (!items.includes(dayPart)) items.push(dayPart);
  }
  return [...groups.entries()].map(([date, dayParts]) => ({ date, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), dayParts }));
}
