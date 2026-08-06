/**
 * Upstream is unofficial and can change without notice (ADR 0002). Every
 * mismatch between what we expect and what we receive must surface as a loud
 * failure — never as a plausible-looking reading.
 */
export class UpstreamContractError extends Error {
  override readonly name = "UpstreamContractError";

  // Written out rather than declared as a constructor parameter property:
  // Node's type stripping erases types, it does not transform syntax, and a
  // parameter property needs transformation. Keeping to strip-only syntax is
  // what lets `node --test src/**/*.test.ts` run with no build step.
  readonly context: { field: string; received: unknown };

  constructor(message: string, context: { field: string; received: unknown }) {
    super(message);
    this.context = context;
  }
}

/**
 * Redact a value before putting it in an error message. Upstream payloads carry
 * sensor serials, account identifiers, and glucose readings; error messages end
 * up in logs and bug reports (`docs/SECURITY.md`).
 */
export function redact(value: unknown): string {
  if (typeof value !== "string") return `<${typeof value}>`;
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-2)} (len ${value.length})`;
}
