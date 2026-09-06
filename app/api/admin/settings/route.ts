import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings } from "@/db/repositories";

// GET/POST /api/admin/settings — the operator-facing config for the
// "Activate Pedagogical Tutor" checkbox + custom prompt textarea (app/admin).
// This is single global config for this single-tenant deployment (spec
// §60), not per-user, so it's gated by a shared token rather than a full
// auth system — there's no login/accounts anywhere else in this app either
// (spec decision: no login in v1).

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SETTINGS_TOKEN;
  if (!expected) return false; // no token configured means the admin page is disabled
  return req.headers.get("x-admin-token") === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getSettings());
}

const BodySchema = z.object({
  customPrompt: z.string().max(8000),
  pedagogicalModeEnabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: parsed.error.message }, { status: 400 });
  }

  await updateSettings(parsed.data);
  return NextResponse.json({ ok: true });
}
