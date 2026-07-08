import { createHmac, timingSafeEqual } from "crypto";

export type CallRole = "creator" | "customer";

function getSecret(): string {
  const secret = process.env.CALL_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing CALL_TOKEN_SECRET environment variable");
  }
  return secret;
}

/**
 * Per-role token proving the holder is who a /call/<bookingId> link was
 * actually sent to. Derived by HMAC rather than stored, so both the
 * creator's and the customer's tokens can be recomputed from the booking id
 * alone — no new column, no migration.
 */
export function generateCallToken(bookingId: string, role: CallRole): string {
  return createHmac("sha256", getSecret()).update(`${bookingId}:${role}`).digest("hex").slice(0, 32);
}

/**
 * Resolves which role (if any) a token proves for a given booking. Deriving
 * the role from the token — instead of trusting a client-supplied role
 * string — is the point: the two confirmation emails for the same booking
 * only ever differed by that string, so anyone could edit their own link to
 * claim the other party's role and record a fake join timestamp for them.
 */
export function resolveRoleFromToken(bookingId: string, token: string | null | undefined): CallRole | null {
  if (!token) return null;

  const tokenBuffer = Buffer.from(token);

  for (const role of ["creator", "customer"] as const) {
    const expected = Buffer.from(generateCallToken(bookingId, role));
    if (expected.length === tokenBuffer.length && timingSafeEqual(expected, tokenBuffer)) {
      return role;
    }
  }

  return null;
}
