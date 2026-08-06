import { UpstreamContractError, redact } from "./errors.ts";

/**
 * Narrowing helpers for unvalidated upstream JSON.
 *
 * Upstream is unofficial and undocumented by its owner (ADR 0002), so every
 * field we depend on is checked at the boundary. These throw rather than
 * coerce: a malformed payload must fail loudly, never flow onward as a
 * plausible value.
 */

export function expectObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UpstreamContractError(`${field} is not an object`, {
      field,
      received: redact(value),
    });
  }
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new UpstreamContractError(`${field} is not an array`, {
      field,
      received: redact(value),
    });
  }
  return value;
}

export function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new UpstreamContractError(`${field} is not a non-empty string`, {
      field,
      received: redact(value),
    });
  }
  return value;
}

export function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UpstreamContractError(`${field} is not a finite number`, {
      field,
      received: redact(value),
    });
  }
  return value;
}

/** Read a nested path, failing with the full path in the error for debuggability. */
export function at(
  root: Record<string, unknown>,
  path: readonly string[],
  rootName: string,
): unknown {
  let cursor: unknown = root;
  const walked: string[] = [rootName];
  for (const key of path) {
    cursor = expectObject(cursor, walked.join("."))[key];
    walked.push(key);
  }
  return cursor;
}
