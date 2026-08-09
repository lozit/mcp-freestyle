import type { FetchLike } from "./librelinkup.ts";

/**
 * Wrap a `fetch` so transient upstream failures are retried.
 *
 * Retry is a transport concern, so it is composed into the transport rather
 * than threaded through every call site — nothing in `librelinkup.ts` knows this
 * exists, and its signatures are unchanged.
 */

/**
 * Statuses worth retrying: the server answered, so we know the request did *not*
 * succeed, and the cause is time-based rather than a problem with the request.
 *
 * `430` is not standard — LibreLinkUp uses it alongside `429` for rate limiting.
 *
 * Deliberately absent: every 4xx other than those two. A 401 will not fix itself
 * by asking again, and retrying it just burns the rate budget that produced the
 * problem.
 */
const RETRYABLE_STATUSES = new Set([429, 430, 502, 503, 504]);

export interface RetryOptions {
  /** Total attempts, first included. */
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait before the next attempt.
 *
 * `Retry-After` wins when upstream sends it — it is the only party that knows
 * its own limits. Both forms are accepted: delay-seconds and an HTTP date.
 * Otherwise, exponential backoff. Either way the result is clamped, so a hostile
 * or mistaken header cannot park a tool call for an hour.
 */
export function retryDelayMs(
  response: Response,
  attempt: number,
  options: { baseDelayMs: number; maxDelayMs: number; now: () => number },
): number {
  const header = response.headers.get("retry-after");

  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, options.maxDelayMs);
    }
    const at = Date.parse(header);
    if (!Number.isNaN(at)) {
      return Math.min(Math.max(at - options.now(), 0), options.maxDelayMs);
    }
    // Unparseable header: fall through to backoff rather than guessing.
  }

  return Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
}

export function withRetry(fetchImpl: FetchLike, options: RetryOptions = {}): FetchLike {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  return async (input, init) => {
    let response = await fetchImpl(input, init);

    for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
      if (!RETRYABLE_STATUSES.has(response.status)) return response;
      await sleep(retryDelayMs(response, attempt, { baseDelayMs, maxDelayMs, now }));
      response = await fetchImpl(input, init);
    }

    // Out of attempts: hand back the last response and let the caller fail
    // loudly on it, rather than inventing an error of our own.
    return response;
  };
}

/**
 * A thrown error is **not** retried, and that is deliberate.
 *
 * When `fetch` rejects we cannot know whether the request reached upstream. For
 * a read that would merely be wasteful, but `login` is a POST that mints a token
 * valid ~180 days with no revocation path (`docs/SECURITY.md`) — retrying a
 * request that may in fact have succeeded risks leaving an orphaned token alive
 * for six months. A status code, by contrast, is proof the request failed.
 */
