import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";

export type ServeMcpHttpOptions = {
  createServer: () => Promise<McpServer>;
  port: number;
  host: string;
  path?: string;
};

export const serveMcpHttpEffect = (options: ServeMcpHttpOptions): Effect.Effect<void> =>
  Effect.gen(function* () {
    const path = options.path ?? "/mcp";
    const hostname = options.host;
    const port = options.port;

    yield* Effect.tryPromise({
      try: async () => {
        const server = Bun.serve({
          hostname,
          port,
          fetch: async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/health") {
              return new Response("ok");
            }
            if (url.pathname !== path && url.pathname !== "/") {
              return new Response("Not found", { status: 404 });
            }
            const mcp = await options.createServer();
            const transport = new WebStandardStreamableHTTPServerTransport({
              sessionIdGenerator: undefined,
              enableJsonResponse: true,
              allowedHosts: [hostname, `localhost:${port}`, `127.0.0.1:${port}`],
              allowedOrigins: [
                `http://${hostname}:${port}`,
                `http://127.0.0.1:${port}`,
                `http://localhost:${port}`,
              ],
              enableDnsRebindingProtection: hostname === "127.0.0.1" || hostname === "localhost",
            });
            await mcp.connect(transport);
            return transport.handleRequest(request);
          },
        });
        process.stderr.write(`cabrakan: streamable HTTP on http://${hostname}:${port}${path}\n`);
        await new Promise<void>((resolve) => {
          const shutdown = () => {
            void server.stop();
            resolve();
          };
          process.once("SIGINT", shutdown);
          process.once("SIGTERM", shutdown);
        });
      },
      catch: (error) => {
        throw error instanceof Error ? error : new Error(String(error));
      },
    });
  });
