// Post-deploy smoke test, run from the GitHub Actions runner (not the
// server) so it exercises the real path a visitor takes — through the
// reverse proxy, not a container-internal port. A green deploy step
// doesn't prove the product actually works, only that the container
// came up.
//
// Usage: node scripts/deploy/smoke.mjs --base https://tutor.your-domain.com

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex !== -1 ? args[baseIndex + 1] : null;

if (!base) {
  console.error("Usage: node scripts/deploy/smoke.mjs --base <url>");
  process.exit(1);
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

await check("homepage loads", async () => {
  const res = await fetch(base, { redirect: "follow" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const html = await res.text();
  if (!html.includes("Ask anything about")) {
    throw new Error("expected chat input placeholder not found in HTML");
  }
});

await check("session API responds", async () => {
  const res = await fetch(`${base}/api/tutor/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousId: crypto.randomUUID() }),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const data = await res.json();
  if (!data.sessionId) throw new Error("response missing sessionId");
});

if (process.exitCode) {
  console.error("\nSmoke test failed — deploy completed but the app isn't actually working.");
  process.exit(1);
}

console.log("\nSmoke test passed.");
