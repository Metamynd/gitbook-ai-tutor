import { NextRequest, NextResponse } from "next/server";
import { getRecentGovernanceEvents } from "@/db/governance-repository";
import { isAdminAuthorized } from "@/app/api/_lib/auth";
import { checkRateLimit } from "@/app/api/_lib/rate-limit";

// GET /api/admin/governance — evidence log, surfaced for review. Same
// shared-token gate as /api/admin/settings (see that file for why: no
// login anywhere else in this app either).

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "admin.governance", RATE_LIMIT, RATE_WINDOW_MS);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const events = await getRecentGovernanceEvents(50);
  return NextResponse.json({ events });
}
