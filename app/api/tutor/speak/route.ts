import { NextRequest, NextResponse } from "next/server";

// POST /api/tutor/speak — Phase 3 (voice output, spec §9, §10).
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "not_implemented", message: "Phase 3: TTS not wired yet." },
    { status: 501 }
  );
}
