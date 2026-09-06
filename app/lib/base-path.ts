// Mirrors next.config.mjs's basePath. Empty by default (deploy at root).
//
// Kept as a constant (not deleted) rather than reverting every call site
// back to a bare string: if this ever becomes a subpath deploy again,
// every fetch()/href call across the app already routes through this
// single value instead of needing to be found and re-prefixed one by one.
// Next.js auto-prefixes next/link, next/image, and router navigation with
// basePath, but NOT plain fetch() calls or hand-written <a href> strings —
// those are what actually consume this constant.
export const BASE_PATH = "";
