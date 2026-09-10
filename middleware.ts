import { NextResponse } from "next/server";

// A reasonably strict default CSP. This template ships with no
// third-party scripts, so this stays simple — plain 'self' on script-src,
// no per-request nonce machinery.
//
// If you add a tool that injects its OWN further inline scripts at
// runtime — Google Tag Manager is the classic example — a plain domain
// allowlist here won't be enough: confirmed by hand on a deployment of
// this codebase that adding e.g. https://www.googletagmanager.com to
// script-src still throws a CSP EvalError, because GTM's own runtime
// evaluates additional script content for whatever tags are configured
// in the container, which a static allowlist can't anticipate. Reach for
// a per-request nonce + 'strict-dynamic' instead of 'unsafe-inline' if
// you hit this — 'unsafe-inline' allows ANY inline script, including an
// attacker-injected one, not just the one you meant to allow.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export function middleware() {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets and Next internals — no page content to protect
  // there, so matching them would only add per-request overhead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
