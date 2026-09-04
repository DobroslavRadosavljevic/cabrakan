import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { executeToolRequest, resolveBaseUrl } from "./http.ts";
import { isHttpUrl, loadOpenApiDocument, type SpecSource } from "./load-spec.ts";
import { readPackageVersion } from "./package-version.ts";
import { applyToolPolicy, type ToolPolicy } from "./policy.ts";
import { openApiToTools } from "./tools.ts";
import type { AuthOptions, FetchLike } from "./types.ts";

export type CreateOpenApiMcpServerOptions = {
  spec: SpecSource;
  specs?: SpecSource[];
  baseUrl?: string;
  headers?: Record<string, string>;
  auth?: AuthOptions;
  fetch?: FetchLike;
  specFetch?: FetchLike;
  name?: string;
  version?: string;
  policy?: ToolPolicy;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  confirmMutating?: boolean;
};

/** Load one or more OpenAPI documents and register each operation as an MCP tool. */
export async function createOpenApiMcpServer(options: CreateOpenApiMcpServerOptions): Promise<McpServer> {
  const sources = options.specs && options.specs.length > 0 ? options.specs : [options.spec];
  const loaded = await Promise.all(
    sources.map(async (source, index) => {
      const document = await loadOpenApiDocument(source, { fetch: options.specFetch });
      const specUrl = typeof source === "string" && isHttpUrl(source) ? source : undefined;
      if (sources.length === 1) {
        resolveBaseUrl(options.baseUrl, document.servers, specUrl);
      }
      const prefix =
        sources.length > 1
          ? `${slugName(typeof source === "string" ? source.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "") : document.info?.title ?? `api${index + 1}`)}_`
          : options.policy?.namePrefix;
      const tools = applyToolPolicy(openApiToTools(document), { ...options.policy, namePrefix: prefix });
      return { document, specUrl, tools };
    }),
  );

  const title = loaded.map((entry) => entry.document.info?.title).filter(Boolean).join(" + ");
  const server = new McpServer({
    name: options.name ?? slugName(title || "sobek"),
    version: options.version ?? loaded[0]?.document.info?.version ?? readPackageVersion(),
  });

  for (const entry of loaded) {
    for (const tool of entry.tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: fromJsonSchema(tool.inputSchema),
        },
        async (args) => {
          const result = await executeToolRequest(tool, (args ?? {}) as Record<string, unknown>, {
            baseUrl: options.baseUrl,
            specUrl: entry.specUrl,
            headers: options.headers,
            auth: options.auth,
            fetch: options.fetch,
            document: entry.document,
            retries: options.retries,
            retryDelayMs: options.retryDelayMs,
            timeoutMs: options.timeoutMs,
            maxResponseBytes: options.maxResponseBytes,
            confirmMutating: options.confirmMutating,
          });
          return {
            content: [{ type: "text" as const, text: result.text }],
            isError: result.isError,
          };
        },
      );
    }
  }

  return server;
}

export function slugName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "sobek"
  );
}
