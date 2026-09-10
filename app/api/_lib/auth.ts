import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// A plain !== on a shared secret leaks timing information -- string
// comparison short-circuits at the first mismatched byte, so response time
// correlates with how many leading characters an attacker guessed
// correctly, letting the token be recovered one character at a time over
// enough requests. timingSafeEqual needs equal-length buffers; the length
// check itself leaks far less (just the token's length, not its content)
// than a naive === would.
function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// Shared-secret gate for /api/admin/* -- a single global token rather than
// a full auth system, since this is single-tenant operator config and
// there's no login anywhere else in this app either.
export function isAdminAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SETTINGS_TOKEN;
  if (!expected) return false; // no token configured means admin is disabled
  const provided = req.headers.get("x-admin-token");
  if (!provided) return false;
  return constantTimeEqual(provided, expected);
}
