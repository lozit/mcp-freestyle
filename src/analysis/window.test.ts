import assert from "node:assert/strict";
import { test } from "node:test";

import type { Reading, TargetRange } from "../domain/reading.ts";
import { findGaps, summarize, timeInRange, withinLastHours } from "./window.ts";

const TARGET: TargetRange = { lowMgPerDl: 70, highMgPerDl: 180 };

/** Synthetic series builder. Minutes are offsets from a fixed base instant. */
function series(
  points: Array<{ minute: number; mgPerDl: number; kind?: 0 | 1 | 2 }>,
): Reading[] {
  const base = Date.UTC(2026, 7, 6, 0, 0, 0);
  return points.map(({ minute, mgPerDl, kind }) => ({
    mgPerDl,
    measuredAt: new Date(base + minute * 60_000),
    kind: kind ?? 0,
    rawTrendArrow: null,
  }));
}

test("time in range uses the account's band, not a hardcoded 70-180", () => {
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 15, mgPerDl: 100 },
    { minute: 30, mgPerDl: 100 },
    { minute: 45, mgPerDl: 100 },
  ]);
  const narrow = timeInRange(readings, { lowMgPerDl: 110, highMgPerDl: 120 });
  assert.equal(narrow?.inRangePct, 0);
  assert.equal(narrow?.belowPct, 100);

  const wide = timeInRange(readings, TARGET);
  assert.equal(wide?.inRangePct, 100);
});

test("time in range excludes alarms — they fire on excursions by definition", () => {
  // Four in-range samples plus two alarms. Counting the alarms would report
  // 33% in range for a person who was in range the whole time.
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 15, mgPerDl: 110 },
    { minute: 30, mgPerDl: 105 },
    { minute: 45, mgPerDl: 100 },
    { minute: 50, mgPerDl: 250, kind: 2 },
    { minute: 55, mgPerDl: 55, kind: 2 },
  ]);
  const result = timeInRange(readings, TARGET);
  assert.equal(result?.inRangePct, 100);
  assert.equal(result?.abovePct, 0);
  assert.equal(result?.belowPct, 0);
});

test("time in range excludes manual scans too", () => {
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 15, mgPerDl: 300, kind: 1 },
  ]);
  assert.equal(timeInRange(readings, TARGET)?.inRangePct, 100);
});

test("returns null rather than 0% when there is nothing to aggregate", () => {
  assert.equal(timeInRange([], TARGET), null);
  assert.equal(timeInRange(series([{ minute: 0, mgPerDl: 100, kind: 2 }]), TARGET), null);
});

test("splits below, in-range and above correctly", () => {
  const readings = series([
    { minute: 0, mgPerDl: 60 },
    { minute: 15, mgPerDl: 100 },
    { minute: 30, mgPerDl: 100 },
    { minute: 45, mgPerDl: 250 },
  ]);
  const result = timeInRange(readings, TARGET);
  assert.equal(result?.belowPct, 25);
  assert.equal(result?.inRangePct, 50);
  assert.equal(result?.abovePct, 25);
});

test("detects a collection gap rather than interpolating across it", () => {
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 15, mgPerDl: 100 },
    { minute: 195, mgPerDl: 100 }, // 3 h later — sensor warm-up sized
    { minute: 210, mgPerDl: 100 },
  ]);
  const gaps = findGaps(readings);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]?.minutes, 180);
});

test("does not report normal 15-minute spacing as a gap", () => {
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 15, mgPerDl: 100 },
    { minute: 30, mgPerDl: 100 },
  ]);
  assert.deepEqual(findGaps(readings), []);
});

test("does not manufacture a gap from the appended current reading", () => {
  // Regression, found by running against a real account (2026-08-06): the graph
  // lags the current reading by 19–25 min, so the join `buildSeries` creates is
  // wider than the sampling cadence. Measuring across it invents a gap that
  // never happened. Only automatic samples count.
  const readings = series([
    { minute: 0, mgPerDl: 120 },
    { minute: 15, mgPerDl: 122 },
    { minute: 30, mgPerDl: 118 },
    { minute: 65, mgPerDl: 124, kind: 1 }, // current reading, 35 min after
  ]);
  assert.deepEqual(findGaps(readings), []);
});

test("still reports a real gap between two automatic samples", () => {
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 180, mgPerDl: 100 },
    { minute: 215, mgPerDl: 100, kind: 1 },
  ]);
  const gaps = findGaps(readings);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]?.minutes, 180);
});

test("tolerates the few-seconds jitter upstream actually sends", () => {
  // Observed intervals ran 14m58s to 15m02s — not exactly 15 minutes.
  const base = Date.UTC(2026, 7, 6, 0, 0, 0);
  const readings: Reading[] = [0, 898, 1800, 2702].map((seconds) => ({
    mgPerDl: 100,
    measuredAt: new Date(base + seconds * 1000),
    kind: 0 as const,
    rawTrendArrow: null,
  }));
  assert.deepEqual(findGaps(readings), []);
});

test("summary reports the range actually covered, not the one requested", () => {
  // Asked for 24 h; upstream can only ever return ~12.
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 690, mgPerDl: 100 }, // 11.5 h span
  ]);
  const summary = summarize(readings, 24, TARGET);
  assert.equal(summary.requestedHours, 24);
  assert.equal(summary.coveredHours, 11.5);
  assert.equal(summary.truncated, true);
});

test("a satisfied request is not flagged as truncated", () => {
  const readings = series([
    { minute: 0, mgPerDl: 100 },
    { minute: 120, mgPerDl: 100 },
  ]);
  assert.equal(summarize(readings, 2, TARGET).truncated, false);
});

test("an empty series reports no coverage instead of a zero-width range", () => {
  const summary = summarize([], 6, TARGET);
  assert.equal(summary.coveredFrom, null);
  assert.equal(summary.coveredTo, null);
  assert.equal(summary.sampleCount, 0);
  assert.equal(summary.timeInRange, null);
  assert.equal(summary.truncated, true);
});

test("filtering a window shrinks it and never extends it", () => {
  const now = new Date(Date.UTC(2026, 7, 6, 12, 0, 0));
  const readings = series([
    { minute: 0, mgPerDl: 100 }, // 12 h before `now`
    { minute: 660, mgPerDl: 100 }, // 1 h before
    { minute: 720, mgPerDl: 100 }, // at `now`
  ]);
  assert.equal(withinLastHours(readings, 2, now).length, 2);
  // Asking for more than exists yields what exists — never padding.
  assert.equal(withinLastHours(readings, 48, now).length, 3);
});
