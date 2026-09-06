import { NextRequest, NextResponse } from "next/server";

// GET /api/tutor/session/:id
export async function GET(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: "not_implemented", message: "Session lookup not wired yet." },
    { status: 501 }
  );
}

// POST /api/tutor/session/:id/end is a separate route — see ./end/route.ts
