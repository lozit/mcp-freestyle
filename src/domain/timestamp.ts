import { UpstreamContractError, redact } from "../upstream/errors.ts";

/**
 * Upstream sends two unmarked date strings per reading:
 *
 *   FactoryTimestamp — UTC.        ← the source of truth, parsed here
 *   Timestamp        — local time, already converted for the account.
 *
 * Both use `M/D/YYYY h:mm:ss AM/PM`. Verified 2026-08-06: the pair differed by
 * exactly 2 h during CEST, and a 12-hour graph window spanned 8/5 → 8/6, which
 * settles the format as month-first rather than day-first.
 *
 * We parse only FactoryTimestamp. The delta between the two fields is the
 * account's current DST offset (2 h in August, 1 h in winter) and encodes
 * nothing durable — never derive a zone from it.
 *
 * `new Date(str)` is deliberately not used: its handling of this shape is
 * implementation-defined and host-locale-dependent, and a silently wrong
 * instant on a glucose reading is not a cosmetic bug.
 */
const FACTORY_TIMESTAMP =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/;

export function parseFactoryTimestamp(raw: string): Date {
  if (typeof raw !== "string") {
    throw new UpstreamContractError("FactoryTimestamp is not a string", {
      field: "FactoryTimestamp",
      received: redact(raw),
    });
  }

  const match = FACTORY_TIMESTAMP.exec(raw.trim());
  if (!match) {
    throw new UpstreamContractError(
      "FactoryTimestamp does not match the expected M/D/YYYY h:mm:ss AM/PM shape",
      { field: "FactoryTimestamp", received: redact(raw) },
    );
  }

  const [, monthStr, dayStr, yearStr, hourStr, minuteStr, secondStr, meridiem] =
    match as unknown as [string, string, string, string, string, string, string, "AM" | "PM"];

  const month = Number(monthStr);
  const day = Number(dayStr);
  const year = Number(yearStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  const hour12 = Number(hourStr);

  if (hour12 < 1 || hour12 > 12) {
    throw new UpstreamContractError("FactoryTimestamp hour is out of 1..12", {
      field: "FactoryTimestamp",
      received: redact(raw),
    });
  }

  // 12 AM is midnight (00), 12 PM is noon (12); every other PM hour adds 12.
  const hour24 = meridiem === "AM" ? hour12 % 12 : (hour12 % 12) + 12;

  const ms = Date.UTC(year, month - 1, day, hour24, minute, second);
  const parsed = new Date(ms);

  // Date.UTC silently rolls over impossible dates (2/30 becomes March 2), which
  // would turn a malformed payload into a confident wrong instant. Round-trip
  // the components to reject that.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour24 ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    throw new UpstreamContractError(
      "FactoryTimestamp is not a real calendar instant",
      { field: "FactoryTimestamp", received: redact(raw) },
    );
  }

  return parsed;
}
