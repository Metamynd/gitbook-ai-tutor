import { NextRequest, NextResponse } from "next/server";

// POST /api/tutor/transcribe — Phase 2 (voice input, spec §7, §27).
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "not_implemented", message: "Phase 2: STT not wired yet." },
    { status: 501 }
  );
}
