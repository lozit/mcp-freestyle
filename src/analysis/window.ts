import type { Reading, TargetRange } from "../domain/reading.ts";

/**
 * Aggregates over a series of readings.
 *
 * The governing rule (docs/LEARNINGS.md): never let a caller's requested window
 * imply the returned window. Upstream ignores the window parameter and caps at
 * ~12 h, so every aggregate here reports the range it *actually* covered
 * alongside the answer, and the caller is expected to pass that on.
 */

/** Upstream samples at ~15 min. Anything beyond twice that is a real gap. */
const NOMINAL_CADENCE_MINUTES = 15;
const GAP_THRESHOLD_MINUTES = NOMINAL_CADENCE_MINUTES * 2 + 1;

export interface Gap {
  readonly from: Date;
  readonly to: Date;
  readonly minutes: number;
}

export interface TimeInRange {
  readonly belowPct: number;
  readonly inRangePct: number;
  readonly abovePct: number;
  readonly targetRange: TargetRange;
  /** How the figure was computed, so the caller can state it rather than imply
   *  a time-weighted average it isn't. */
  readonly method: "share of samples, not time-weighted";
}

export interface WindowSummary {
  readonly requestedHours: number;
  /** Null when the series is empty — there is no range to report. */
  readonly coveredFrom: Date | null;
  readonly coveredTo: Date | null;
  readonly coveredHours: number;
  readonly sampleCount: number;
  /** True when upstream returned less than asked. Callers must surface this. */
  readonly truncated: boolean;
  readonly gaps: readonly Gap[];
  readonly timeInRange: TimeInRange | null;
}

/** Keep only readings at or after the cutoff. Does not extend the series — the
 *  window can only ever shrink here, never grow to match a request. */
export function withinLastHours(
  series: readonly Reading[],
  hours: number,
  now: Date,
): Reading[] {
  const cutoff = now.getTime() - hours * 3_600_000;
  return series.filter((reading) => reading.measuredAt.getTime() >= cutoff);
}

/**
 * Find collection gaps — sensor warm-up, disconnection, out of range.
 *
 * A gap is absence, not a zero and not something to interpolate across
 * (docs/DATA_MODEL.md § "Gaps are data"). Reporting them is what lets a caller
 * say "82% in range, but 3 h are missing" instead of a confident bare number.
 *
 * **Automatic samples only.** A gap is a discontinuity in the *sampling*, and
 * only `kind: Sample` readings are sampled on a cadence. Scans and alarms are
 * event-triggered, and the current reading that `buildSeries` appends sits
 * 19–25 min past the last graph point (both values observed against a real
 * account) — measuring against it manufactures a gap that never happened.
 */
export function findGaps(series: readonly Reading[]): Gap[] {
  const samples = series.filter((reading) => reading.kind === 0);
  const gaps: Gap[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (!previous || !current) continue;
    const minutes =
      (current.measuredAt.getTime() - previous.measuredAt.getTime()) / 60_000;
    if (minutes > GAP_THRESHOLD_MINUTES) {
      gaps.push({
        from: previous.measuredAt,
        to: current.measuredAt,
        minutes: Math.round(minutes),
      });
    }
  }
  return gaps;
}

/**
 * Time in range against the account's own target band.
 *
 * The band is not configured by the user and not a constant — upstream supplies
 * `targetLow`/`targetHigh` per account (70/180 mg/dL observed).
 *
 * Only `Sample` readings count. Scans and alarms are event-triggered: an alarm
 * fires *by definition* on an excursion, so including them would skew the
 * result systematically toward out-of-range (docs/LEARNINGS.md).
 */
export function timeInRange(
  series: readonly Reading[],
  targetRange: TargetRange,
): TimeInRange | null {
  const samples = series.filter((reading) => reading.kind === 0);
  if (samples.length === 0) return null;

  let below = 0;
  let above = 0;
  for (const sample of samples) {
    if (sample.mgPerDl < targetRange.lowMgPerDl) below += 1;
    else if (sample.mgPerDl > targetRange.highMgPerDl) above += 1;
  }
  const inRange = samples.length - below - above;
  const pct = (n: number) => Math.round((n / samples.length) * 1000) / 10;

  return {
    belowPct: pct(below),
    inRangePct: pct(inRange),
    abovePct: pct(above),
    targetRange,
    method: "share of samples, not time-weighted",
  };
}

export function summarize(
  series: readonly Reading[],
  requestedHours: number,
  targetRange: TargetRange,
): WindowSummary {
  const first = series[0];
  const last = series[series.length - 1];

  const coveredHours =
    first && last
      ? Math.round(
          ((last.measuredAt.getTime() - first.measuredAt.getTime()) / 3_600_000) * 10,
        ) / 10
      : 0;

  return {
    requestedHours,
    coveredFrom: first?.measuredAt ?? null,
    coveredTo: last?.measuredAt ?? null,
    coveredHours,
    sampleCount: series.length,
    // A tenth of an hour of slack: samples land on ~15 min boundaries, so an
    // exactly-satisfied request still falls a few minutes short of the nominal.
    truncated: coveredHours + 0.1 < requestedHours,
    gaps: findGaps(series),
    timeInRange: timeInRange(series, targetRange),
  };
}
