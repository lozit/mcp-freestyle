import assert from "node:assert/strict";
import { test } from "node:test";

import type { FetchLike } from "./librelinkup.ts";
import { retryDelayMs, withRetry } from "./retry.ts";

/** Queue of responses, plus a record of every attempt and every sleep. */
function harness(statuses: Array<number | { status: number; retryAfter: string }>) {
  const attempts: Array<{ url: string; body: string | null }> = [];
  const slept: number[] = [];
  const queue = [...statuses];

  const fetchImpl: FetchLike = async (input, init) => {
    attempts.push({
      url: String(input),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = queue.shift() ?? 200;
    const { status, retryAfter } =
      typeof next === "number" ? { status: next, retryAfter: undefined } : next;
    return new Response("{}", {
      status,
      headers: retryAfter ? { "retry-after": retryAfter } : {},
    });
  };

  return {
    attempts,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
    },
    fetchImpl,
  };
}

test("retries a 429 and returns the eventual success", async () => {
  const h = harness([429, 200]);
  const response = await withRetry(h.fetchImpl, { sleep: h.sleep })("https://x.test");

  assert.equal(response.status, 200);
  assert.equal(h.attempts.length, 2);
});

test("retries the vendor-specific 430", async () => {
  // Not a standard status; LibreLinkUp uses it alongside 429.
  const h = harness([430, 200]);
  const response = await withRetry(h.fetchImpl, { sleep: h.sleep })("https://x.test");

  assert.equal(response.status, 200);
  assert.equal(h.attempts.length, 2);
});

test("retries transient server errors", async () => {
  for (const status of [502, 503, 504]) {
    const h = harness([status, 200]);
    const response = await withRetry(h.fetchImpl, { sleep: h.sleep })("https://x.test");
    assert.equal(response.status, 200, `status ${status} should be retried`);
  }
});

test("does not retry a failure that asking again cannot fix", async () => {
  // A 401 will not resolve itself, and retrying burns the rate budget.
  for (const status of [400, 401, 403, 404]) {
    const h = harness([status, 200]);
    const response = await withRetry(h.fetchImpl, { sleep: h.sleep })("https://x.test");
    assert.equal(response.status, status, `status ${status} must not be retried`);
    assert.equal(h.attempts.length, 1);
    assert.deepEqual(h.slept, []);
  }
});

test("does not sleep or re-request when the first attempt succeeds", async () => {
  const h = harness([200]);
  await withRetry(h.fetchImpl, { sleep: h.sleep })("https://x.test");

  assert.equal(h.attempts.length, 1);
  assert.deepEqual(h.slept, []);
});

test("gives up after maxAttempts and returns the last response", async () => {
  const h = harness([429, 429, 429, 429]);
  const response = await withRetry(h.fetchImpl, { sleep: h.sleep, maxAttempts: 3 })(
    "https://x.test",
  );

  // The caller fails loudly on this status; retry does not invent its own error.
  assert.equal(response.status, 429);
  assert.equal(h.attempts.length, 3);
  assert.equal(h.slept.length, 2);
});

test("backs off exponentially between attempts", async () => {
  const h = harness([429, 429, 429, 200]);
  await withRetry(h.fetchImpl, { sleep: h.sleep, maxAttempts: 4, baseDelayMs: 100 })(
    "https://x.test",
  );

  assert.deepEqual(h.slept, [100, 200, 400]);
});

test("re-sends the same request, body included", async () => {
  const h = harness([429, 200]);
  await withRetry(h.fetchImpl, { sleep: h.sleep })("https://x.test", {
    method: "POST",
    body: JSON.stringify({ hello: "world" }),
  });

  assert.equal(h.attempts.length, 2);
  assert.equal(h.attempts[0]?.body, h.attempts[1]?.body);
  assert.equal(h.attempts[1]?.url, "https://x.test");
});

test("obeys Retry-After given in seconds", async () => {
  const h = harness([{ status: 429, retryAfter: "7" }, 200]);
  await withRetry(h.fetchImpl, { sleep: h.sleep, baseDelayMs: 100 })("https://x.test");

  // Upstream's own number wins over our backoff.
  assert.deepEqual(h.slept, [7000]);
});

test("obeys Retry-After given as an HTTP date", async () => {
  // Kept under the default 30 s cap so this test isolates date parsing;
  // clamping has its own test below.
  const now = Date.UTC(2027, 4, 9, 9, 26, 0);
  const h = harness([
    { status: 429, retryAfter: new Date(now + 20_000).toUTCString() },
    200,
  ]);
  await withRetry(h.fetchImpl, { sleep: h.sleep, now: () => now })("https://x.test");

  assert.deepEqual(h.slept, [20_000]);
});

test("clamps a Retry-After that would park the call for an hour", async () => {
  const h = harness([{ status: 429, retryAfter: "3600" }, 200]);
  await withRetry(h.fetchImpl, { sleep: h.sleep, maxDelayMs: 30_000 })("https://x.test");

  assert.deepEqual(h.slept, [30_000]);
});

test("falls back to backoff when Retry-After is unparseable", async () => {
  const h = harness([{ status: 429, retryAfter: "soon-ish" }, 200]);
  await withRetry(h.fetchImpl, { sleep: h.sleep, baseDelayMs: 100 })("https://x.test");

  assert.deepEqual(h.slept, [100]);
});

test("treats a Retry-After date already in the past as no wait", async () => {
  const now = Date.UTC(2027, 4, 9, 9, 26, 0);
  const h = harness([
    { status: 429, retryAfter: new Date(now - 60_000).toUTCString() },
    200,
  ]);
  await withRetry(h.fetchImpl, { sleep: h.sleep, now: () => now })("https://x.test");

  assert.deepEqual(h.slept, [0]);
});

test("does not retry a thrown network error", async () => {
  // We cannot know whether the request reached upstream. `login` is a POST that
  // mints a 180-day token with no revocation path — replaying a request that may
  // have succeeded risks orphaning one. A status code proves failure; a throw
  // does not.
  let calls = 0;
  const failing: FetchLike = async () => {
    calls += 1;
    throw new TypeError("network down");
  };

  await assert.rejects(
    () => withRetry(failing, { sleep: async () => {} })("https://x.test"),
    /network down/,
  );
  assert.equal(calls, 1);
});

test("retryDelayMs is exponential and clamped", () => {
  const options = { baseDelayMs: 1000, maxDelayMs: 5000, now: () => 0 };
  const plain = new Response("{}", { status: 429 });

  assert.equal(retryDelayMs(plain, 1, options), 1000);
  assert.equal(retryDelayMs(plain, 2, options), 2000);
  assert.equal(retryDelayMs(plain, 3, options), 4000);
  assert.equal(retryDelayMs(plain, 4, options), 5000);
  assert.equal(retryDelayMs(plain, 99, options), 5000);
});
