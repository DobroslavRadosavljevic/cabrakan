import { parseArgs } from "node:util";
import { parseHttpMethods, type ToolPolicy } from "./policy.ts";
import type { AuthOptions } from "./types.ts";

export type CliOptions = {
  spec: string;
  specs: string[];
  baseUrl?: string;
  headers?: Record<string, string>;
  auth?: AuthOptions;
  name?: string;
  /** MCP server version advertised to clients (not the npm package version). */
  version?: string;
  transport: "stdio" | "http";
  port: number;
  host: string;
  listTools?: boolean;
  validateSpec?: boolean;
  noConfirm?: boolean;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  policy: ToolPolicy;
};

export function parseCli(argv: string[]): CliOptions | { help: true } | { showVersion: true } | { error: string } {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      spec: { type: "string", short: "s", multiple: true },
      "base-url": { type: "string" },
      header: { type: "string", multiple: true, short: "H" },
      bearer: { type: "string" },
      "api-key": { type: "string" },
      basic: { type: "string" },
      "oauth-token": { type: "string" },
      "oauth-client-id": { type: "string" },
      "oauth-client-secret": { type: "string" },
      "oauth-token-url": { type: "string" },
      "auth-scheme": { type: "string" },
      name: { type: "string" },
      version: { type: "boolean", short: "V" },
      "server-version": { type: "string" },
      help: { type: "boolean", short: "h" },
      transport: { type: "string" },
      port: { type: "string" },
      host: { type: "string" },
      include: { type: "string", multiple: true },
      exclude: { type: "string", multiple: true },
      tag: { type: "string", multiple: true },
      "exclude-tag": { type: "string", multiple: true },
      method: { type: "string", multiple: true },
      "path-prefix": { type: "string", multiple: true },
      "list-tools": { type: "boolean" },
      "validate-spec": { type: "boolean" },
      "no-confirm": { type: "boolean" },
      retries: { type: "string" },
      "retry-delay-ms": { type: "string" },
      "timeout-ms": { type: "string" },
      "max-response-bytes": { type: "string" },
    },
  });

  if (values.help) {
    return { help: true };
  }
  if (values.version) {
    return { showVersion: true };
  }

  const specs = [...(values.spec ?? []), ...positionals];
  const spec = specs[0];
  if (!spec) {
    return { error: "Missing OpenAPI spec. Pass a file path, URL, or --spec." };
  }

  const headers: Record<string, string> = {};
  for (const header of values.header ?? []) {
    const index = header.indexOf(":");
    if (index === -1) {
      return { error: `Invalid header (use Name: value): ${header}` };
    }
    headers[header.slice(0, index).trim()] = header.slice(index + 1).trim();
  }

  const bearer = values.bearer ?? values["oauth-token"] ?? process.env.OPENAPI_MCP_BEARER;
  const apiKey = values["api-key"] ?? process.env.OPENAPI_MCP_API_KEY;
  const basic = values.basic ?? process.env.OPENAPI_MCP_BASIC;
  const schemeName = values["auth-scheme"];
  const auth: AuthOptions = {};
  if (bearer) {
    auth.bearer = bearer;
  }
  if (apiKey) {
    auth.apiKey = apiKey;
  }
  if (basic) {
    auth.basic = basic;
  }
  const clientId = values["oauth-client-id"] ?? process.env.OPENAPI_MCP_CLIENT_ID;
  const clientSecret = values["oauth-client-secret"] ?? process.env.OPENAPI_MCP_CLIENT_SECRET;
  if (clientId || clientSecret || values["oauth-token-url"] || values["oauth-token"]) {
    auth.schemes = {
      [schemeName ?? "oauth2"]: {
        token: values["oauth-token"],
        clientId,
        clientSecret,
        tokenUrl: values["oauth-token-url"],
      },
    };
  }

  const transport = values.transport ?? "stdio";
  if (transport !== "stdio" && transport !== "http") {
    return { error: 'Invalid --transport. Use "stdio" or "http".' };
  }

  const port = Number(values.port ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return { error: "Invalid --port. Use an integer between 0 and 65535." };
  }
  const nonNegative = (
    raw: string | undefined,
    flag: string,
  ): number | undefined | { error: string } => {
    if (raw === undefined) {
      return undefined;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : { error: `Invalid ${flag}. Use a non-negative number.` };
  };
  const retries = nonNegative(values.retries, "--retries");
  if (typeof retries === "object") {
    return retries;
  }
  const retryDelayMs = nonNegative(values["retry-delay-ms"], "--retry-delay-ms");
  if (typeof retryDelayMs === "object") {
    return retryDelayMs;
  }
  const timeoutMs = nonNegative(values["timeout-ms"], "--timeout-ms");
  if (typeof timeoutMs === "object") {
    return timeoutMs;
  }
  const maxResponseBytes = nonNegative(values["max-response-bytes"], "--max-response-bytes");
  if (typeof maxResponseBytes === "object") {
    return maxResponseBytes;
  }

  const methods = parseHttpMethods(values.method);
  if (methods && "error" in methods) {
    return { error: methods.error };
  }

  return {
    spec,
    specs,
    baseUrl: values["base-url"],
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    auth: Object.keys(auth).length > 0 ? auth : undefined,
    name: values.name,
    version: values["server-version"],
    transport,
    port: Number(values.port ?? 3000),
    host: values.host ?? "127.0.0.1",
    listTools: values["list-tools"] || undefined,
    validateSpec: values["validate-spec"] || undefined,
    noConfirm: values["no-confirm"] || undefined,
    retries,
    retryDelayMs,
    timeoutMs,
    maxResponseBytes,
    policy: {
      include: values.include,
      exclude: values.exclude,
      tags: values.tag,
      excludeTags: values["exclude-tag"],
      methods,
      pathPrefixes: values["path-prefix"],
    },
  };
}

export const CLI_HELP = `Usage: sobek <spec> [options]

Start an MCP server from an OpenAPI 3.x or Swagger 2.0 file/URL.
Default transport is stdio. Use --transport http for Streamable HTTP.

Options:
  --spec, -s            OpenAPI file path or http(s) URL (repeatable)
  --base-url            Override servers[0].url
  -H, --header          Extra header (Name: value), repeatable
  --bearer              HTTP bearer / OAuth access token
  --api-key             API key for apiKey security schemes
  --basic               HTTP basic auth as username:password
  --oauth-token         Access token for oauth2 / openIdConnect schemes
  --oauth-client-id     OAuth2 client credentials id
  --oauth-client-secret OAuth2 client credentials secret
  --oauth-token-url     Override token URL
  --auth-scheme         Security scheme name for OAuth/API key credentials
  --transport           stdio (default) or http
  --host                HTTP bind host (default 127.0.0.1)
  --port                HTTP bind port (default 3000)
  --include             Tool name glob, repeatable
  --exclude             Tool name glob deny list, repeatable
  --tag                 Only tools with this OpenAPI tag, repeatable
  --exclude-tag         Drop tools with this tag, repeatable
  --method              HTTP method allow list, repeatable
  --path-prefix         Only paths with this prefix, repeatable
  --retries             Retry count for 429/5xx/network (default 2)
  --retry-delay-ms      Delay between retries
  --timeout-ms          Upstream request timeout (default 20000)
  --max-response-bytes  Truncate large responses (default 100000)
  --no-confirm          Skip confirm=true on POST/PUT/PATCH/DELETE
  --list-tools          Print tool names and exit
  --validate-spec       Load the spec and exit
  --server-version      MCP server version string sent to clients
  --version, -V         Print the npm package version and exit
`;
