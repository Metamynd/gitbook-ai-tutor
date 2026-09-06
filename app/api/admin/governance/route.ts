import { NextRequest, NextResponse } from "next/server";
import { getRecentGovernanceEvents } from "@/db/governance-repository";

// GET /api/admin/governance — spec §61 evidence, surfaced for review.
// Same shared-token gate as /api/admin/settings (see that file for why:
// no login anywhere else in this app either).

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SETTINGS_TOKEN;
  if (!expected) return false;
  return req.headers.get("x-admin-token") === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const events = await getRecentGovernanceEvents(50);
  return NextResponse.json({ events });
}
