#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { summarize, withinLastHours } from "./analysis/window.ts";
import { ConfigError, configFromEnv } from "./config.ts";
import { inUnit, type GlucoseUnit, type Reading } from "./domain/reading.ts";
import { Client } from "./session.ts";
import { UpstreamContractError } from "./upstream/errors.ts";

/**
 * MCP stdio server exposing a FreeStyle sensor read-only.
 *
 * stdout carries the MCP protocol — every diagnostic goes to stderr. A stray
 * console.log here corrupts the transport.
 */

const UNIT = z
  .enum(["mg/dL", "mmol/L"])
  .default("mg/dL")
  .describe("Unit for the returned values. Storage is always mg/dL; this only affects display.");

/** Upstream caps the graph window at ~12 h regardless of what is asked. */
const MAX_HOURS = 12;

function renderReading(reading: Reading, unit: GlucoseUnit) {
  return {
    value: inUnit(reading, unit),
    unit,
    measured_at: reading.measuredAt.toISOString(),
    // Deliberately not translated into a direction: the integer mapping is
    // undocumented and unverified, and a confidently wrong arrow is worse than
    // no arrow. See PLAN.md.
    raw_trend_arrow: reading.rawTrendArrow,
  };
}

function asJson(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function asError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Turn a thrown error into something the agent can act on, without leaking
 *  credentials or readings into the message. */
function explain(error: unknown): string {
  if (error instanceof ConfigError) {
    // Already written for a human to act on — see src/config.ts.
    return error.message;
  }
  if (error instanceof UpstreamContractError) {
    return (
      `Upstream returned something unexpected and the request was refused rather than ` +
      `answered with a possibly-wrong value. ${error.message} ` +
      `(field: ${error.context.field}). The LibreLinkUp API is unofficial and may have ` +
      `changed — try setting LIBRELINKUP_VERSION to the current LibreLinkUp app version.`
    );
  }
  if (error instanceof Error) return `Request failed: ${error.message}`;
  return "Request failed for an unknown reason.";
}

/**
 * Resolve configuration on first use, not at startup.
 *
 * Exiting at startup on a missing credential would surface in the MCP client as
 * "Server disconnected" and nothing else — the actionable message would go to a
 * stderr nobody reads. Starting anyway means the user asks a question and gets
 * "run mcp-freestyle-login" as the answer, which is where they are looking.
 */
function lazyClient(): () => Client {
  let client: Client | null = null;
  return () => {
    client ??= new Client(configFromEnv());
    return client;
  };
}

async function main(): Promise<void> {
  const client = lazyClient();
  const server = new McpServer({ name: "mcp-freestyle", version: "0.1.0" });

  server.registerTool(
    "get_current_glucose",
    {
      title: "Current glucose",
      description:
        "Read the most recent glucose measurement from the FreeStyle sensor, with the " +
        "instant it was actually measured. The value is the latest one upstream holds, " +
        "not a live reading — always report `measured_at` rather than calling it 'now'. " +
        "Informational only: this is not a medical device and must not be used for any " +
        "treatment decision.",
      inputSchema: { unit: UNIT },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ unit }) => {
      try {
        const { reading, targetRange } = await client().current();
        return asJson({
          ...renderReading(reading, unit),
          target_range: {
            low: inUnit({ ...reading, mgPerDl: targetRange.lowMgPerDl }, unit),
            high: inUnit({ ...reading, mgPerDl: targetRange.highMgPerDl }, unit),
            unit,
            source: "the account's own configured band, not a default",
          },
        });
      } catch (error) {
        return asError(explain(error));
      }
    },
  );

  server.registerTool(
    "get_glucose_history",
    {
      title: "Glucose history and time in range",
      description:
        `Glucose readings over the last N hours (max ${MAX_HOURS}), with time-in-range ` +
        `computed against the account's own target band. ` +
        `Upstream holds only about ${MAX_HOURS} hours of detailed data and ignores any ` +
        `longer request, so the response always states the range it actually covered and ` +
        `sets \`truncated\` when that is less than asked — report that range, never the ` +
        `one requested. Collection gaps are listed separately and are not interpolated ` +
        `across; a percentage over a series with gaps describes only the covered time. ` +
        `Informational only: not a medical device, and not a basis for any treatment ` +
        `decision. This is not an HbA1c or GMI estimate — those need weeks of data.`,
      inputSchema: {
        hours: z
          .number()
          .int()
          .min(1)
          .max(MAX_HOURS)
          .default(MAX_HOURS)
          .describe(`Hours of history to cover, 1 to ${MAX_HOURS}.`),
        unit: UNIT,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ hours, unit }) => {
      try {
        const { series, targetRange } = await client().history();
        const windowed = withinLastHours(series, hours, new Date());
        const summary = summarize(windowed, hours, targetRange);

        return asJson({
          requested_hours: summary.requestedHours,
          covered: {
            from: summary.coveredFrom?.toISOString() ?? null,
            to: summary.coveredTo?.toISOString() ?? null,
            hours: summary.coveredHours,
            truncated: summary.truncated,
            note: summary.truncated
              ? "Upstream returned less than requested. State the covered range, not the requested one."
              : null,
          },
          sample_count: summary.sampleCount,
          gaps: summary.gaps.map((gap) => ({
            from: gap.from.toISOString(),
            to: gap.to.toISOString(),
            minutes: gap.minutes,
          })),
          time_in_range: summary.timeInRange
            ? {
                below_pct: summary.timeInRange.belowPct,
                in_range_pct: summary.timeInRange.inRangePct,
                above_pct: summary.timeInRange.abovePct,
                method: summary.timeInRange.method,
                excludes: "scans and alarms — alarms fire on excursions and would skew the result",
              }
            : null,
          readings: windowed.map((reading) => renderReading(reading, unit)),
        });
      } catch (error) {
        return asError(explain(error));
      }
    },
  );

  await server.connect(new StdioServerTransport());
  process.stderr.write("mcp-freestyle ready on stdio\n");
}

main().catch((error: unknown) => {
  process.stderr.write(
    `mcp-freestyle failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
