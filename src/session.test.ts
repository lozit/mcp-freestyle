import assert from "node:assert/strict";
import { test } from "node:test";

import type { LibreLinkUpConfig } from "./config.ts";
import { Client } from "./session.ts";
import type { FetchLike } from "./upstream/librelinkup.ts";

const CONFIG: LibreLinkUpConfig = {
  email: "follower@example.test",
  password: "not-a-real-password",
  version: "9.9.9",
  product: "llu.test",
  baseUrl: "https://api.libreview.test",
};

const MEASUREMENT = {
  FactoryTimestamp: "5/9/2027 09:26:00 AM",
  ValueInMgPerDl: 123,
  type: 1,
  TrendArrow: 3,
};

const SAMPLE = {
  FactoryTimestamp: "5/9/2027 08:11:00 AM",
  ValueInMgPerDl: 104,
  type: 0,
  TrendArrow: null,
};

/** Far-future expiry so `ensureSession` treats the session as live. */
const LIVE_EXPIRY = Math.floor(Date.UTC(2099, 0, 1) / 1000);

function loginBody(expires = LIVE_EXPIRY) {
  return {
    status: 0,
    data: {
      authTicket: { token: "login-token", expires },
      user: { id: "u-1" },
    },
  };
}

function connectionsBody(ticketToken?: string) {
  const body: Record<string, unknown> = {
    status: 0,
    data: [
      {
        patientId: "p-1",
        targetLow: 70,
        targetHigh: 180,
        glucoseMeasurement: MEASUREMENT,
      },
    ],
  };
  if (ticketToken) body["ticket"] = { token: ticketToken, expires: LIVE_EXPIRY };
  return body;
}

function graphBody() {
  return {
    status: 0,
    data: {
      connection: { targetLow: 70, targetHigh: 180, glucoseMeasurement: MEASUREMENT },
      graphData: [SAMPLE],
    },
  };
}

function stubFetch(responses: unknown[]): {
  fetch: FetchLike;
  authHeaders: Array<string | undefined>;
  urls: string[];
} {
  const queue = [...responses];
  const authHeaders: Array<string | undefined> = [];
  const urls: string[] = [];

  const fetch: FetchLike = async (input, init) => {
    const next = queue.shift();
    assert.ok(next !== undefined, `unexpected extra request to ${String(input)}`);
    urls.push(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    authHeaders.push(headers["authorization"]);
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { fetch, authHeaders, urls };
}

test("logs in once and reuses the session across tool calls", async () => {
  const { fetch, urls } = stubFetch([
    loginBody(),
    connectionsBody(),
    connectionsBody(),
  ]);
  const client = new Client(CONFIG, fetch);

  await client.current();
  await client.current();

  assert.equal(urls.filter((url) => url.endsWith("/llu/auth/login")).length, 1);
});

test("carries the rotated token into the next request", async () => {
  const { fetch, authHeaders } = stubFetch([
    loginBody(),
    connectionsBody("rotated-token"),
    connectionsBody(),
  ]);
  const client = new Client(CONFIG, fetch);

  await client.current();
  await client.current();

  // [0] login (unauthenticated), [1] first call uses the login token,
  // [2] second call must use the token upstream handed back.
  assert.equal(authHeaders[1], "Bearer login-token");
  assert.equal(authHeaders[2], "Bearer rotated-token");
});

test("re-authenticates rather than letting an expired token fail mid-query", async () => {
  const expired = Math.floor(Date.UTC(2020, 0, 1) / 1000);
  const { fetch, urls } = stubFetch([
    loginBody(expired),
    connectionsBody(),
    loginBody(expired),
    connectionsBody(),
  ]);
  const client = new Client(CONFIG, fetch);

  await client.current();
  await client.current();

  assert.equal(urls.filter((url) => url.endsWith("/llu/auth/login")).length, 2);
});

test("history resolves the patient id before hitting the graph endpoint", async () => {
  const { fetch, urls } = stubFetch([loginBody(), connectionsBody(), graphBody()]);
  const client = new Client(CONFIG, fetch);

  await client.history();

  assert.ok(urls[1]?.endsWith("/llu/connections"));
  assert.ok(urls[2]?.endsWith("/llu/connections/p-1/graph"));
});

test("history reuses a patient id already resolved by a current() call", async () => {
  const { fetch, urls } = stubFetch([loginBody(), connectionsBody(), graphBody()]);
  const client = new Client(CONFIG, fetch);

  await client.current();
  await client.history();

  assert.equal(urls.filter((url) => url.endsWith("/llu/connections")).length, 1);
});

test("history appends the current reading to the graph samples", async () => {
  const { fetch } = stubFetch([loginBody(), connectionsBody(), graphBody()]);
  const client = new Client(CONFIG, fetch);

  const { series } = await client.history();

  // graphData ends at 08:11; the current reading is 09:26 and is absent from it.
  // A series taken straight from graphData would silently stop 75 min short.
  assert.equal(series.length, 2);
  assert.equal(series[0]?.measuredAt.toISOString(), "2027-05-09T08:11:00.000Z");
  assert.equal(series[1]?.measuredAt.toISOString(), "2027-05-09T09:26:00.000Z");
});
