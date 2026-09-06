import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/costs — Phase 5 (cost dashboard, spec §34).
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    { error: "not_implemented", message: "Phase 5: cost dashboard not wired yet." },
    { status: 501 }
  );
}
