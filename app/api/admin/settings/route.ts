import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings } from "@/db/repositories";
import { isAdminAuthorized } from "@/app/api/_lib/auth";
import { checkRateLimit } from "@/app/api/_lib/rate-limit";

// GET/POST /api/admin/settings — the operator-facing config for the
// "Activate Pedagogical Tutor" checkbox + custom prompt textarea (app/admin).
// This is single global config for this single-tenant deployment, not
// per-user, so it's gated by a shared token rather than a full auth
// system — there's no login/accounts anywhere else in this app either.

// A shared static token with no rate limit is brute-forceable given enough
// requests; this caps the guess rate regardless of token strength.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "admin.settings", RATE_LIMIT, RATE_WINDOW_MS);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getSettings());
}

const BodySchema = z.object({
  customPrompt: z.string().max(8000),
  pedagogicalModeEnabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "admin.settings", RATE_LIMIT, RATE_WINDOW_MS);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: parsed.error.message }, { status: 400 });
  }

  await updateSettings(parsed.data);
  return NextResponse.json({ ok: true });
}
