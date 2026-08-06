/**
 * End-to-end smoke test against a real LibreLinkUp account.
 *
 *   LIBRELINKUP_EMAIL=… LIBRELINKUP_PASSWORD=… npm run smoke
 *
 * This is the one check the test suite cannot do: everything else is verified
 * against stubs. It exercises login → region redirect → Account-Id →
 * connections → graph, then reports what came back.
 *
 * Output is deliberately redacted — no token, no sensor serial, no account or
 * patient identifier — so it is safe to paste into an issue. It *does* print
 * your glucose values, because checking them is the point; that is fine on your
 * own terminal and not fine in a public bug report.
 */
import { configFromEnv, ConfigError } from "../src/config.ts";
import { summarize } from "../src/analysis/window.ts";
import { Client } from "../src/session.ts";
import { UpstreamContractError } from "../src/upstream/errors.ts";

function line(label: string, value: unknown): void {
  console.log(`  ${label.padEnd(26)} ${String(value)}`);
}

async function main(): Promise<void> {
  const config = configFromEnv();
  console.log("\n▸ Configuration");
  line("entry point", config.baseUrl);
  line("pinned version", config.version);
  line("product", config.product);
  line("credentials", "present (not shown)");

  const client = new Client(config);

  console.log("\n▸ get_current_glucose");
  const { reading, targetRange } = await client.current();
  const ageMinutes = Math.round((Date.now() - reading.measuredAt.getTime()) / 60_000);
  line("value", `${reading.mgPerDl} mg/dL`);
  line("measured at (UTC)", reading.measuredAt.toISOString());
  line("age", `${ageMinutes} min — never call this "now"`);
  line("target band", `${targetRange.lowMgPerDl}–${targetRange.highMgPerDl} mg/dL`);
  line("raw trend arrow", reading.rawTrendArrow ?? "null");

  console.log("\n▸ get_glucose_history");
  const { series } = await client.history();
  const summary = summarize(series, 24, targetRange);
  line("samples returned", summary.sampleCount);
  line("covered from (UTC)", summary.coveredFrom?.toISOString() ?? "—");
  line("covered to (UTC)", summary.coveredTo?.toISOString() ?? "—");
  line("covered hours", summary.coveredHours);
  line("asked for", "24 h");
  line("truncated", summary.truncated);
  line("gaps", summary.gaps.length);
  for (const gap of summary.gaps) {
    line("  gap", `${gap.minutes} min ending ${gap.to.toISOString()}`);
  }
  if (summary.timeInRange) {
    const tir = summary.timeInRange;
    line("time in range", `${tir.inRangePct}% (below ${tir.belowPct}%, above ${tir.abovePct}%)`);
  }

  // Cadence — confirms the ~15 min spacing and the jitter tolerance.
  const intervals: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const a = series[i - 1];
    const b = series[i];
    if (a && b) intervals.push((b.measuredAt.getTime() - a.measuredAt.getTime()) / 1000);
  }
  if (intervals.length > 0) {
    line("interval min/max (s)", `${Math.min(...intervals)} / ${Math.max(...intervals)}`);
  }

  // The graph lags the current reading and omits it; buildSeries appends it.
  const last = series[series.length - 1];
  if (last) {
    line("series ends at (UTC)", last.measuredAt.toISOString());
    line("matches current", last.measuredAt.getTime() === reading.measuredAt.getTime());
  }

  // Feeds the open TrendArrow mapping task in PLAN.md. Run this a few times
  // across a rise and a fall: the arrow value paired with the slope of the last
  // samples is what lets the enum be mapped from evidence instead of guessed.
  console.log("\n▸ TrendArrow evidence (for the open mapping task)");
  const tail = series.slice(-4).map((r) => r.mgPerDl);
  line("last 4 samples", tail.join(" → "));
  line("arrow on current", reading.rawTrendArrow ?? "null");
  line("note", "record arrow + slope across a rise and a fall before mapping");

  console.log("\n✔ End-to-end path works.\n");
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`\n✖ ${error.message}\n`);
    process.exit(1);
  }
  if (error instanceof UpstreamContractError) {
    console.error(`\n✖ Upstream contract mismatch on \`${error.context.field}\`.`);
    console.error(`  ${error.message}`);
    console.error(
      `  If this mentions a version or auth failure, set LIBRELINKUP_VERSION to the` +
        ` current LibreLinkUp app version and retry.\n`,
    );
    process.exit(1);
  }
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
