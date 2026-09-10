import { NextRequest } from "next/server";

// Fixed-window, in-memory rate limiter. In-memory is safe as long as this
// app runs as a single container instance — if this is ever scaled
// horizontally, each instance would track its own counters and the
// effective limit would multiply, so this would need to move to a shared
// store (e.g. Redis) at that point.
//
// Keyed by client IP, not anonymousId: anonymousId is a client-generated
// UUID sent in the request body, so a malicious client can mint a fresh
// one per request for free — it identifies a *learner*, not a *client*,
// and enforcing against it would enforce nothing. IP is the actual scarce
// resource an anonymous caller doesn't fully control.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Sweep stale buckets periodically so long-lived one-off IPs don't leak
// memory forever. unref() so this timer never keeps the process alive.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

function clientIp(req: NextRequest): string {
  // If this is deployed behind Cloudflare, CF-Connecting-IP is the
  // header to trust, not X-Forwarded-For or X-Real-IP — confirmed by
  // red-teaming a real deployment of this codebase: X-Forwarded-For's
  // first entry is client-settable (a spoofed value bypassed a rate
  // limit entirely), and X-Real-IP can end up reflecting the proxy's own
  // rotating edge node rather than the real visitor depending on the
  // proxy chain, which silently breaks rate limiting for everyone, not
  // just attackers. CF-Connecting-IP is set at Cloudflare's edge and
  // can't be overridden by the client through the real traffic path.
  //
  // Not behind Cloudflare? This header simply won't be present, and the
  // code falls back to X-Forwarded-For's first entry — the standard
  // trustworthy position for a single reverse proxy that doesn't rewrite
  // it. If you put a different CDN/proxy in front of this, check what it
  // actually sets before trusting this fallback for real rate limiting.
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const forwardedFor = req.headers.get("x-forwarded-for");
  const firstHop = forwardedFor?.split(",")[0]?.trim();
  return firstHop || "unknown";
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

// name namespaces the bucket per route so one endpoint's traffic can't
// consume another's budget.
export function checkRateLimit(req: NextRequest, name: string, limit: number, windowMs: number): RateLimitResult {
  const key = `${name}:${clientIp(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}
