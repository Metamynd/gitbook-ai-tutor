// Dev utility: verify a GitBook MCP endpoint's tool contract and try a
// search query against it. Useful when pointing the tutor at a new
// GitBook-hosted docs site (e.g. swapping GITBOOK_MCP_URL later).
//
// Usage: node scripts/probe-gitbook-mcp.mjs <mcp-url> [search query]

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2];
const query = process.argv.slice(3).join(" ") || "what is this documentation about";

if (!url) {
  console.error("Usage: node scripts/probe-gitbook-mcp.mjs <mcp-url> [search query]");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(url));
const client = new Client({ name: "probe", version: "0.0.1" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("Tools:", tools.map((t) => t.name).join(", "));

const result = await client.callTool({ name: "searchDocumentation", arguments: { query } });
console.log(`\nSample search results for "${query}":\n`);
for (const block of result.content) {
  console.log(block.text.split("\n").slice(0, 2).join(" | "));
}
