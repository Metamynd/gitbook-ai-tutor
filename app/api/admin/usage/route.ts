import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/usage — Phase 5 (usage tracking, spec §33).
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    { error: "not_implemented", message: "Phase 5: usage admin view not wired yet." },
    { status: 501 }
  );
}
