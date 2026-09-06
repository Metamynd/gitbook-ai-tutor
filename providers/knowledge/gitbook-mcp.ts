import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  KnowledgeProvider,
  KnowledgeResult,
  KnowledgeDocument,
} from "../../tutor-core/providers/types";

// spec §11, §14 — knowledge source is any GitBook-hosted docs site's
// standard MCP integration, exposed at "<docs-domain>/~gitbook/mcp" with a
// fixed tool set (searchDocumentation, getPage, askQuestion, sendFeedback).
// Confirmed live against a real GitBook MCP endpoint via
// scripts/probe-gitbook-mcp.mjs. Because this is GitBook's own tool
// contract rather than something product-specific, switching knowledge
// sources later (a different product's GitBook entirely) is just
// changing GITBOOK_MCP_URL — no code change.

const SEARCH_TOOL = "searchDocumentation";
const READ_TOOL = "getPage";

// searchDocumentation returns one text block per hit, each formatted as:
// "Title: ...\nLink: ...\nContent: ...."
const SEARCH_HIT_PATTERN = /^Title: (.*)\nLink: (.*)\nContent: ([\s\S]*)$/;

export class GitBookMCPProvider implements KnowledgeProvider {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(
    private readonly url: string = process.env.GITBOOK_MCP_URL ?? "",
    private readonly apiKey: string = process.env.GITBOOK_MCP_API_KEY ?? ""
  ) {}

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    if (!this.url) {
      throw new Error("GITBOOK_MCP_URL is not configured.");
    }

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: this.apiKey
          ? { headers: { Authorization: `Bearer ${this.apiKey}` } }
          : undefined,
      });
      const client = new Client({ name: "ai-tutor", version: "0.1.0" });
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    return this.connecting;
  }

  async search(query: string): Promise<KnowledgeResult[]> {
    const client = await this.getClient();
    const result = await client.callTool({ name: SEARCH_TOOL, arguments: { query } });
    return parseSearchResults(result);
  }

  async read(resourceUrl: string): Promise<KnowledgeDocument> {
    const client = await this.getClient();
    const result = await client.callTool({ name: READ_TOOL, arguments: { url: resourceUrl } });
    const content = extractTextBlocks(result).join("\n\n");

    if (!content) {
      throw new Error(`GitBook MCP returned no content for ${resourceUrl}.`);
    }

    return {
      id: resourceUrl,
      title: extractMarkdownTitle(content) ?? resourceUrl,
      url: resourceUrl,
      content,
    };
  }
}

function extractTextBlocks(raw: unknown): string[] {
  const content = (raw as { content?: unknown[] })?.content ?? [];
  return content
    .filter((block): block is { type: string; text: string } =>
      typeof block === "object" && block !== null && "text" in block
    )
    .map((block) => String(block.text));
}

function parseSearchResults(raw: unknown): KnowledgeResult[] {
  return extractTextBlocks(raw).map((text, index) => {
    const match = SEARCH_HIT_PATTERN.exec(text);
    if (!match) {
      return { id: `${index}`, title: "Untitled", content: text };
    }
    const title = match[1] ?? "Untitled";
    const url = match[2] ?? undefined;
    const content = match[3] ?? text;
    return { id: url || `${index}`, title, url, content, score: 1 - index * 0.05 };
  });
}

function extractMarkdownTitle(markdown: string): string | undefined {
  return /^#\s+(.+)$/m.exec(markdown)?.[1];
}
