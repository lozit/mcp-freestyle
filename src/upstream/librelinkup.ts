import { createHash } from "node:crypto";

import type { LibreLinkUpConfig } from "../config.ts";
import type { Reading, TargetRange } from "../domain/reading.ts";
import { toReading } from "../domain/reading.ts";
import { UpstreamContractError, redact } from "./errors.ts";
import { at, expectArray, expectNumber, expectObject, expectString } from "./json.ts";

/**
 * Client for the LibreLinkUp cloud API.
 *
 * Unofficial and unsupported by Abbott (ADR 0002). This module is the single
 * place that knows upstream's shapes — a breaking change upstream has its blast
 * radius here and nowhere else. The verified contract is documented in
 * `docs/ARCHITECTURE.md` § "Verified upstream contract".
 */

/** A live upstream session. The token is a secret with a ~180-day life and no
 *  revocation path — hold it in memory, never persist or log it. */
export interface Session {
  readonly token: string;
  readonly accountIdHash: string;
  /** Regional host discovered at login, e.g. `https://api-fr.libreview.io`. */
  readonly baseUrl: string;
  readonly expiresAt: Date;
}

export interface Connection {
  readonly patientId: string;
  readonly targetRange: TargetRange;
  /** Inlined by upstream — the current reading costs no extra request. */
  readonly current: Reading;
}

export interface GraphWindow {
  /** ~12 h of ~15-minute samples. Upstream ignores any requested window. */
  readonly samples: Reading[];
  /** Lags `samples` (~19 min observed) and is absent from them. */
  readonly current: Reading;
  readonly targetRange: TargetRange;
}

export type FetchLike = typeof globalThis.fetch;

/**
 * SHA-256 of the account id, hex, lowercase — the `Account-Id` header upstream
 * began requiring partway through its version churn.
 *
 * Hashed with no trailing newline: a stray `\n` yields a different digest and
 * an opaque 4xx that looks like bad credentials.
 */
export function accountIdHash(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex");
}

function headers(
  config: LibreLinkUpConfig,
  session?: Session,
): Record<string, string> {
  const base: Record<string, string> = {
    "content-type": "application/json",
    "accept-encoding": "gzip",
    product: config.product,
    version: config.version,
  };
  if (session) {
    base["authorization"] = `Bearer ${session.token}`;
    base["Account-Id"] = session.accountIdHash;
  }
  return base;
}

async function readJson(response: Response, what: string): Promise<Record<string, unknown>> {
  if (!response.ok) {
    // 429 and the vendor-specific 430 both mean rate limiting.
    throw new UpstreamContractError(
      `${what} failed with HTTP ${response.status}` +
        (response.status === 429 || response.status === 430
          ? " (rate limited — poll no faster than the ~15 min data cadence)"
          : ""),
      { field: what, received: response.status },
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new UpstreamContractError(`${what} returned a non-JSON body`, {
      field: what,
      received: "<unparseable>",
    });
  }
  return expectObject(body, what);
}

/**
 * Capture the rotated ticket returned at the root of every authenticated
 * response. Upstream hands back a fresh token on each call; reusing the login
 * token indefinitely is how a long-lived process drifts into a stale session.
 */
function withRotatedTicket(session: Session, body: Record<string, unknown>): Session {
  const ticket = body["ticket"];
  if (typeof ticket !== "object" || ticket === null) return session;
  const token = (ticket as Record<string, unknown>)["token"];
  if (typeof token !== "string" || token.length === 0) return session;
  return { ...session, token };
}

/**
 * Authenticate, following the regional redirect.
 *
 * The region is *discovered*, not configured — upstream answers the first login
 * with `{redirect: true, region: "fr"}` and the real login happens against
 * `api-<region>.libreview.io`. The value is used verbatim and never checked
 * against a list of known regions: `fr` was observed in the wild and is absent
 * from every community list, so an allowlist would reject valid accounts.
 */
export async function login(
  config: LibreLinkUpConfig,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<Session> {
  const attempt = async (baseUrl: string): Promise<Record<string, unknown>> => {
    const response = await fetchImpl(`${baseUrl}/llu/auth/login`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    return readJson(response, "login");
  };

  let baseUrl = config.baseUrl;
  let body = await attempt(baseUrl);

  const data = expectObject(body["data"], "login.data");
  if (data["redirect"] === true) {
    const region = expectString(data["region"], "login.data.region");
    baseUrl = `https://api-${region}.libreview.io`;
    body = await attempt(baseUrl);
  }

  const token = expectString(
    at(body, ["data", "authTicket", "token"], "login"),
    "login.data.authTicket.token",
  );
  const expires = expectNumber(
    at(body, ["data", "authTicket", "expires"], "login"),
    "login.data.authTicket.expires",
  );
  const userId = expectString(
    at(body, ["data", "user", "id"], "login"),
    "login.data.user.id",
  );

  return {
    token,
    accountIdHash: accountIdHash(userId),
    baseUrl,
    expiresAt: new Date(expires * 1000),
  };
}

function targetRangeOf(connection: Record<string, unknown>): TargetRange {
  return {
    lowMgPerDl: expectNumber(connection["targetLow"], "connection.targetLow"),
    highMgPerDl: expectNumber(connection["targetHigh"], "connection.targetHigh"),
  };
}

/**
 * List followed patients. Returns the first connection and the rotated session.
 *
 * V1 is single-account (`docs/VISION.md` non-goals), so more than one followed
 * patient is an unhandled situation rather than something to silently pick from.
 */
export async function getConnection(
  config: LibreLinkUpConfig,
  session: Session,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<{ connection: Connection; session: Session }> {
  const response = await fetchImpl(`${session.baseUrl}/llu/connections`, {
    method: "GET",
    headers: headers(config, session),
  });
  const body = await readJson(response, "connections");
  const list = expectArray(body["data"], "connections.data");

  if (list.length === 0) {
    throw new UpstreamContractError(
      "No followed patient on this account — check that LibreLinkUp sharing is set up",
      { field: "connections.data", received: 0 },
    );
  }
  if (list.length > 1) {
    throw new UpstreamContractError(
      `Expected exactly one followed patient, got ${list.length}. ` +
        `Multi-patient support is a V1 non-goal — see docs/VISION.md.`,
      { field: "connections.data", received: list.length },
    );
  }

  const raw = expectObject(list[0], "connections.data[0]");

  return {
    connection: {
      patientId: expectString(raw["patientId"], "connection.patientId"),
      targetRange: targetRangeOf(raw),
      current: toReading(expectObject(raw["glucoseMeasurement"], "connection.glucoseMeasurement")),
    },
    session: withRotatedTicket(session, body),
  };
}

/**
 * Fetch the graph window.
 *
 * Takes no window parameter on purpose: upstream's `minutes` argument is
 * ignored — `minutes=1440` returned 47 points spanning 11 h 30 — so accepting
 * one here would let a caller's request imply a range we cannot deliver.
 * Callers filter the returned samples and report the range actually covered.
 */
export async function getGraph(
  config: LibreLinkUpConfig,
  session: Session,
  patientId: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<{ window: GraphWindow; session: Session }> {
  const response = await fetchImpl(
    `${session.baseUrl}/llu/connections/${encodeURIComponent(patientId)}/graph`,
    { method: "GET", headers: headers(config, session) },
  );
  const body = await readJson(response, "graph");
  const data = expectObject(body["data"], "graph.data");
  const connection = expectObject(data["connection"], "graph.data.connection");

  const samples = expectArray(data["graphData"], "graph.data.graphData").map(
    (item, index) => toReading(expectObject(item, `graph.data.graphData[${index}]`)),
  );

  return {
    window: {
      samples,
      current: toReading(
        expectObject(connection["glucoseMeasurement"], "graph.data.connection.glucoseMeasurement"),
      ),
      targetRange: targetRangeOf(connection),
    },
    session: withRotatedTicket(session, body),
  };
}

/** Re-exported so callers can assert on the failure type without reaching into
 *  the errors module directly. */
export { UpstreamContractError, redact };
