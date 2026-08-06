import type { LibreLinkUpConfig } from "./config.ts";
import type { Reading, TargetRange } from "./domain/reading.ts";
import { buildSeries } from "./domain/reading.ts";
import type { FetchLike, Session } from "./upstream/librelinkup.ts";
import { getConnection, getGraph, login } from "./upstream/librelinkup.ts";

/**
 * Holds the upstream session across tool calls.
 *
 * Two things this exists to get right:
 *  - the token rotates on every authenticated response, so it must be carried
 *    forward rather than re-read from the login response;
 *  - the token is a ~180-day secret with no revocation path, so it lives in
 *    memory only — never persisted, never logged (docs/SECURITY.md).
 */
export class Client {
  private readonly config: LibreLinkUpConfig;
  private readonly fetchImpl: FetchLike;
  private session: Session | null = null;
  private patientId: string | null = null;

  constructor(config: LibreLinkUpConfig, fetchImpl: FetchLike = globalThis.fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private async ensureSession(): Promise<Session> {
    // Re-login slightly before expiry rather than on a failed call, so a long-
    // lived process doesn't surface a confusing mid-query auth error.
    const stillValid =
      this.session && this.session.expiresAt.getTime() - Date.now() > 60_000;
    if (!stillValid) {
      this.session = await login(this.config, this.fetchImpl);
      this.patientId = null;
    }
    return this.session as Session;
  }

  /** Current reading + the account's target band. One request — upstream inlines
   *  the measurement in the connections response. */
  async current(): Promise<{ reading: Reading; targetRange: TargetRange }> {
    const session = await this.ensureSession();
    const result = await getConnection(this.config, session, this.fetchImpl);
    this.session = result.session;
    this.patientId = result.connection.patientId;
    return {
      reading: result.connection.current,
      targetRange: result.connection.targetRange,
    };
  }

  /**
   * The graph window as one ordered series.
   *
   * `buildSeries` appends the current reading to the graph samples — the graph
   * lags it by ~19 minutes and does not contain it, so a series taken straight
   * from `graphData` silently ends in the past.
   */
  async history(): Promise<{ series: Reading[]; targetRange: TargetRange }> {
    const session = await this.ensureSession();
    if (!this.patientId) {
      const connection = await getConnection(this.config, session, this.fetchImpl);
      this.session = connection.session;
      this.patientId = connection.connection.patientId;
    }
    const result = await getGraph(
      this.config,
      this.session as Session,
      this.patientId,
      this.fetchImpl,
    );
    this.session = result.session;
    return {
      series: buildSeries(result.window.samples, result.window.current),
      targetRange: result.window.targetRange,
    };
  }
}
