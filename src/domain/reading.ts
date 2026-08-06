import { UpstreamContractError, redact } from "../upstream/errors.ts";
import { parseFactoryTimestamp } from "./timestamp.ts";

/**
 * The two glucose units in real-world use. This type exists for *rendering*
 * only — a stored value is always mg/dL (see `Reading.mgPerDl`).
 */
export type GlucoseUnit = "mg/dL" | "mmol/L";

/** mg/dL ÷ this = mmol/L. Cross-checked against upstream `alarmRules`, which
 *  carries both scales for the same threshold: 250 / 18.0182 = 13.87 ≈ 13.9. */
const MG_PER_DL_PER_MMOL_PER_L = 18.0182;

/**
 * One glucose measurement.
 *
 * There is deliberately no `value` + `unit` pair. Upstream always supplies
 * `ValueInMgPerDl` — a field whose unit is in its own name — so the canonical
 * value can be unit-unambiguous by construction rather than by discipline.
 * Convert at the output edge, never in the middle (docs/DATA_MODEL.md).
 */
export interface Reading {
  /** Canonical value. Always mg/dL — the name is the contract. */
  readonly mgPerDl: number;
  /** Instant of measurement, parsed from upstream `FactoryTimestamp` (UTC). */
  readonly measuredAt: Date;
  /** `0` automatic sample · `1` scan / current reading · `2` alarm. */
  readonly kind: ReadingKind;
  /**
   * Upstream `TrendArrow`, verbatim and **unmapped**.
   *
   * Only present on the current reading; `graphData` points carry none. The
   * integer→direction mapping is undocumented and has not been verified against
   * a real account, so it is deliberately not translated here — inventing a
   * mapping would produce a confident wrong arrow. See PLAN.md.
   */
  readonly rawTrendArrow: number | null;
}

export const ReadingKind = {
  Sample: 0,
  Scan: 1,
  Alarm: 2,
} as const;
export type ReadingKind = (typeof ReadingKind)[keyof typeof ReadingKind];

/** Convert for display. The stored value stays mg/dL. */
export function inUnit(reading: Reading, unit: GlucoseUnit): number {
  if (unit === "mg/dL") return reading.mgPerDl;
  // One decimal place is the convention for mmol/L, and matches how upstream
  // reports its own mmol thresholds (`thmm`).
  return Math.round((reading.mgPerDl / MG_PER_DL_PER_MMOL_PER_L) * 10) / 10;
}

/** The account's target band, as supplied by upstream. Not a constant, and not
 *  something the user has to configure — upstream sends it per account. */
export interface TargetRange {
  readonly lowMgPerDl: number;
  readonly highMgPerDl: number;
}

/** The shape we accept from upstream. Only the fields we actually rely on. */
interface RawGlucoseItem {
  FactoryTimestamp?: unknown;
  ValueInMgPerDl?: unknown;
  type?: unknown;
  TrendArrow?: unknown;
}

/**
 * Normalize one upstream item into a domain `Reading`.
 *
 * Validates rather than coerces: an unexpected payload must fail loudly here,
 * at the single isolated boundary, instead of flowing onward as a plausible
 * number (ADR 0002, CLAUDE.md).
 */
export function toReading(raw: RawGlucoseItem): Reading {
  const mgPerDl = raw.ValueInMgPerDl;
  if (typeof mgPerDl !== "number" || !Number.isFinite(mgPerDl)) {
    throw new UpstreamContractError("ValueInMgPerDl is not a finite number", {
      field: "ValueInMgPerDl",
      received: redact(mgPerDl),
    });
  }

  const kind = raw.type;
  if (kind !== 0 && kind !== 1 && kind !== 2) {
    throw new UpstreamContractError("Unknown reading `type`", {
      field: "type",
      received: redact(kind),
    });
  }

  const trend = raw.TrendArrow;
  if (trend !== undefined && trend !== null && typeof trend !== "number") {
    throw new UpstreamContractError("TrendArrow is neither null nor a number", {
      field: "TrendArrow",
      received: redact(trend),
    });
  }

  return {
    mgPerDl,
    measuredAt: parseFactoryTimestamp(raw.FactoryTimestamp as string),
    kind,
    rawTrendArrow: typeof trend === "number" ? trend : null,
  };
}

/**
 * Build a single ordered series from a graph window plus the current reading.
 *
 * Two upstream traps handled here, both verified 2026-08-06:
 *  - `graphData` lags the current reading (~19 min observed) and does not
 *    contain it, so a series built from the graph alone silently ends in the
 *    past. The current reading is appended.
 *  - `logbook` is newest-first while `graphData` is oldest-first. Nothing here
 *    trusts upstream ordering; everything is sorted by instant.
 */
export function buildSeries(
  graph: readonly Reading[],
  current: Reading | null,
): Reading[] {
  const byInstant = new Map<number, Reading>();
  for (const reading of graph) byInstant.set(reading.measuredAt.getTime(), reading);
  if (current) byInstant.set(current.measuredAt.getTime(), current);

  return [...byInstant.values()].sort(
    (a, b) => a.measuredAt.getTime() - b.measuredAt.getTime(),
  );
}
