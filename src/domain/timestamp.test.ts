import assert from "node:assert/strict";
import { test } from "node:test";

import { UpstreamContractError } from "../upstream/errors.ts";
import { parseFactoryTimestamp } from "./timestamp.ts";

// All fixtures below are synthetic. Never paste a real payload into a test —
// upstream responses carry sensor serials and account identifiers, and this
// repo is public (docs/SECURITY.md).

test("parses a FactoryTimestamp as UTC, not host-local time", () => {
  const parsed = parseFactoryTimestamp("5/9/2027 09:26:00 AM");
  assert.equal(parsed.toISOString(), "2027-05-09T09:26:00.000Z");
});

test("reads the date as month-first, not day-first", () => {
  // 5/9 is 9 May. Under D/M it would be 5 September — four months adrift.
  const parsed = parseFactoryTimestamp("5/9/2027 12:00:00 PM");
  assert.equal(parsed.getUTCMonth(), 4); // 0-indexed: May
  assert.equal(parsed.getUTCDate(), 9);
});

test("maps 12 AM to midnight and 12 PM to noon", () => {
  assert.equal(
    parseFactoryTimestamp("1/1/2026 12:00:00 AM").toISOString(),
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(
    parseFactoryTimestamp("1/1/2026 12:00:00 PM").toISOString(),
    "2026-01-01T12:00:00.000Z",
  );
});

test("handles the PM hours either side of noon", () => {
  assert.equal(
    parseFactoryTimestamp("1/1/2026 1:05:09 PM").toISOString(),
    "2026-01-01T13:05:09.000Z",
  );
  assert.equal(
    parseFactoryTimestamp("1/1/2026 11:59:59 PM").toISOString(),
    "2026-01-01T23:59:59.000Z",
  );
});

test("accepts both single- and double-digit fields", () => {
  assert.equal(
    parseFactoryTimestamp("12/25/2026 09:07:03 AM").toISOString(),
    "2026-12-25T09:07:03.000Z",
  );
});

test("ignores the host timezone entirely", () => {
  // A parser built on `new Date(str)` would shift with TZ; this one must not.
  const before = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    const a = parseFactoryTimestamp("5/9/2027 09:26:00 AM");
    process.env.TZ = "Pacific/Niue"; // UTC-11
    const b = parseFactoryTimestamp("5/9/2027 09:26:00 AM");
    assert.equal(a.getTime(), b.getTime());
    assert.equal(a.toISOString(), "2027-05-09T09:26:00.000Z");
  } finally {
    process.env.TZ = before;
  }
});

test("rejects a rolled-over calendar date instead of silently shifting it", () => {
  // Date.UTC turns 2/30 into 2 March. That must fail loudly, not resolve.
  assert.throws(
    () => parseFactoryTimestamp("2/30/2026 10:00:00 AM"),
    UpstreamContractError,
  );
});

test("rejects an out-of-range 12-hour clock value", () => {
  assert.throws(
    () => parseFactoryTimestamp("1/1/2026 13:00:00 PM"),
    UpstreamContractError,
  );
  assert.throws(
    () => parseFactoryTimestamp("1/1/2026 0:00:00 AM"),
    UpstreamContractError,
  );
});

test("rejects shapes that are not the documented format", () => {
  for (const bad of [
    "2027-05-09T09:26:00Z", // ISO — right instant, wrong contract
    "5/9/2027 09:26 AM", // no seconds
    "5/9/2027 09:26:00", // no meridiem
    "5/9/27 09:26:00 AM", // two-digit year
    "",
  ]) {
    assert.throws(
      () => parseFactoryTimestamp(bad),
      UpstreamContractError,
      `expected rejection for ${JSON.stringify(bad)}`,
    );
  }
});

test("does not leak the offending value verbatim into the error message", () => {
  try {
    parseFactoryTimestamp("this-is-not-a-timestamp-at-all");
    assert.fail("expected a throw");
  } catch (error) {
    assert.ok(error instanceof UpstreamContractError);
    assert.doesNotMatch(error.message, /not-a-timestamp-at-all/);
  }
});
