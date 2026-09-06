import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deploy at root by default (see app/lib/base-path.ts). If you're
  // serving this under a subpath instead of its own (sub)domain, set
  // basePath here — Next's supported way to do that — and update
  // BASE_PATH in app/lib/base-path.ts to match; every fetch()/href call
  // in the app already routes through that one constant.
  // Standalone output for a lean Docker image — copies only the files a
  // running server needs instead of the full node_modules tree.
  output: "standalone",
  // A stray package-lock.json in a parent directory (an unrelated
  // project) makes Next misdetect the workspace root and, with
  // output: "standalone", actually copy the WRONG directory tree into
  // .next/standalone — caught by checking its contents before trusting
  // the Docker build. Pinning the root here is the fix Next's own
  // warning suggests.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
