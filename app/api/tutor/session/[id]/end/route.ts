import { NextRequest, NextResponse } from "next/server";

// POST /api/tutor/session/:id/end
export async function POST(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: "not_implemented", message: "Session end not wired yet." },
    { status: 501 }
  );
}
