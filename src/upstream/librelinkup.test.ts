import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import type { LibreLinkUpConfig } from "../config.ts";
import { UpstreamContractError } from "./errors.ts";
import {
  accountIdHash,
  getConnection,
  getGraph,
  login,
  type FetchLike,
  type Session,
} from "./librelinkup.ts";

// Every fixture below is synthetic. Real payloads carry sensor serials, account
// identifiers and glucose values, and this repo is public (docs/SECURITY.md).

const CONFIG: LibreLinkUpConfig = {
  email: "follower@example.test",
  password: "correct-horse-battery-staple",
  version: "9.9.9",
  product: "llu.test",
  baseUrl: "https://api.libreview.test",
};

const SESSION: Session = {
  token: "token-from-login",
  accountIdHash: "a".repeat(64),
  baseUrl: "https://api-zz.libreview.io",
  expiresAt: new Date("2027-01-01T00:00:00Z"),
};

const MEASUREMENT = {
  FactoryTimestamp: "5/9/2027 09:26:00 AM",
  ValueInMgPerDl: 123,
  type: 1,
  TrendArrow: 3,
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Stub fetch that replays queued responses and records what it was called with. */
function stubFetch(responses: Array<{ status?: number; body: unknown }>): {
  fetch: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const queue = [...responses];

  const fetch: FetchLike = async (input, init) => {
    const next = queue.shift();
    assert.ok(next, `unexpected extra request to ${String(input)}`);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { fetch, calls };
}

const loginSuccess = (userId = "user-1") => ({
  status: 0,
  data: {
    authTicket: { token: "fresh-token", expires: 1801566697, duration: 15552000000 },
    user: { id: userId },
  },
});

test("login follows the regional redirect and uses the region verbatim", async () => {
  const { fetch, calls } = stubFetch([
    { body: { status: 0, data: { redirect: true, region: "zz" } } },
    { body: loginSuccess() },
  ]);

  const session = await login(CONFIG, fetch);

  assert.equal(calls[0]?.url, "https://api.libreview.test/llu/auth/login");
  // `zz` is not in any community region list — an allowlist would have rejected
  // it. `fr` was exactly this case in the wild.
  assert.equal(calls[1]?.url, "https://api-zz.libreview.io/llu/auth/login");
  assert.equal(session.baseUrl, "https://api-zz.libreview.io");
  assert.equal(session.token, "fresh-token");
});

test("login sends the pinned version from config, not a hardcoded constant", async () => {
  const { fetch, calls } = stubFetch([{ body: loginSuccess() }]);
  await login(CONFIG, fetch);

  assert.equal(calls[0]?.headers["version"], "9.9.9");
  assert.equal(calls[0]?.headers["product"], "llu.test");
});

test("Account-Id is the SHA-256 of the user id with no trailing newline", async () => {
  const { fetch } = stubFetch([{ body: loginSuccess("u-1") }]);
  const session = await login(CONFIG, fetch);

  assert.equal(
    session.accountIdHash,
    createHash("sha256").update("u-1", "utf8").digest("hex"),
  );
  // The classic mistake: `echo` adds \n and yields an opaque 4xx.
  assert.notEqual(
    session.accountIdHash,
    createHash("sha256").update("u-1\n", "utf8").digest("hex"),
  );
  assert.match(session.accountIdHash, /^[0-9a-f]{64}$/);
});

test("authenticated requests carry Bearer token and Account-Id", async () => {
  const { fetch, calls } = stubFetch([
    {
      body: {
        status: 0,
        data: [{ patientId: "p-1", targetLow: 70, targetHigh: 180, glucoseMeasurement: MEASUREMENT }],
      },
    },
  ]);
  await getConnection(CONFIG, SESSION, fetch);

  assert.equal(calls[0]?.headers["authorization"], "Bearer token-from-login");
  assert.equal(calls[0]?.headers["Account-Id"], SESSION.accountIdHash);
});

test("captures the rotated ticket returned on every authenticated response", async () => {
  const { fetch } = stubFetch([
    {
      body: {
        status: 0,
        data: [{ patientId: "p-1", targetLow: 70, targetHigh: 180, glucoseMeasurement: MEASUREMENT }],
        ticket: { token: "rotated-token", expires: 1801566697 },
      },
    },
  ]);
  const { session } = await getConnection(CONFIG, SESSION, fetch);
  assert.equal(session.token, "rotated-token");
});

test("keeps the existing token when no ticket is returned", async () => {
  const { fetch } = stubFetch([
    {
      body: {
        status: 0,
        data: [{ patientId: "p-1", targetLow: 70, targetHigh: 180, glucoseMeasurement: MEASUREMENT }],
      },
    },
  ]);
  const { session } = await getConnection(CONFIG, SESSION, fetch);
  assert.equal(session.token, "token-from-login");
});

test("reads the account's own target range rather than a hardcoded band", async () => {
  const { fetch } = stubFetch([
    {
      body: {
        status: 0,
        data: [{ patientId: "p-1", targetLow: 80, targetHigh: 160, glucoseMeasurement: MEASUREMENT }],
      },
    },
  ]);
  const { connection } = await getConnection(CONFIG, SESSION, fetch);
  assert.deepEqual(connection.targetRange, { lowMgPerDl: 80, highMgPerDl: 160 });
});

test("refuses to guess when the account follows more than one patient", async () => {
  const patient = {
    patientId: "p-1",
    targetLow: 70,
    targetHigh: 180,
    glucoseMeasurement: MEASUREMENT,
  };
  const { fetch } = stubFetch([{ body: { status: 0, data: [patient, patient] } }]);

  await assert.rejects(
    () => getConnection(CONFIG, SESSION, fetch),
    UpstreamContractError,
  );
});

test("says something actionable when no patient is shared", async () => {
  const { fetch } = stubFetch([{ body: { status: 0, data: [] } }]);
  await assert.rejects(
    () => getConnection(CONFIG, SESSION, fetch),
    (error: unknown) =>
      error instanceof UpstreamContractError && /sharing is set up/.test(error.message),
  );
});

test("graph requests send no window parameter — upstream ignores it", async () => {
  const { fetch, calls } = stubFetch([
    {
      body: {
        status: 0,
        data: {
          connection: { targetLow: 70, targetHigh: 180, glucoseMeasurement: MEASUREMENT },
          graphData: [{ ...MEASUREMENT, FactoryTimestamp: "5/9/2027 08:11:00 AM", type: 0, TrendArrow: null }],
        },
      },
    },
  ]);
  const { window } = await getGraph(CONFIG, SESSION, "p-1", fetch);

  assert.equal(calls[0]?.url, "https://api-zz.libreview.io/llu/connections/p-1/graph");
  assert.doesNotMatch(calls[0]?.url ?? "", /minutes/);
  assert.equal(window.samples.length, 1);
  assert.equal(window.samples[0]?.rawTrendArrow, null); // graph points carry no trend
  assert.equal(window.current.mgPerDl, 123);
});

test("surfaces rate limiting, including the vendor-specific 430", async () => {
  for (const status of [429, 430]) {
    const { fetch } = stubFetch([{ status, body: {} }]);
    await assert.rejects(
      () => getConnection(CONFIG, SESSION, fetch),
      (error: unknown) =>
        error instanceof UpstreamContractError && /rate limited/.test(error.message),
      `status ${status} should read as rate limiting`,
    );
  }
});

test("fails loudly on a malformed payload instead of inventing a reading", async () => {
  const { fetch } = stubFetch([
    {
      body: {
        status: 0,
        data: [
          {
            patientId: "p-1",
            targetLow: 70,
            targetHigh: 180,
            // Value present but under the display-only field, with no
            // ValueInMgPerDl — exactly the shape that must not be guessed at.
            glucoseMeasurement: { ...MEASUREMENT, ValueInMgPerDl: undefined, Value: 123 },
          },
        ],
      },
    },
  ]);
  await assert.rejects(() => getConnection(CONFIG, SESSION, fetch), UpstreamContractError);
});

test("never puts the password or the token in an error message", async () => {
  const { fetch } = stubFetch([{ status: 401, body: {} }]);
  try {
    await login(CONFIG, fetch);
    assert.fail("expected a throw");
  } catch (error) {
    assert.ok(error instanceof UpstreamContractError);
    assert.doesNotMatch(error.message, /correct-horse/);
    assert.doesNotMatch(JSON.stringify(error.context), /correct-horse/);
  }
});

test("accountIdHash is stable and lowercase hex", () => {
  assert.equal(accountIdHash("abc"), accountIdHash("abc"));
  assert.match(accountIdHash("abc"), /^[0-9a-f]{64}$/);
});
