# Library API

Use the library when the process already owns stdio or HTTP. Use the CLI when Cursor or Claude should spawn cabrakan.

## Create the server

```ts
import { createOpenApiMcpServer } from "cabrakan";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

serveStdio(() =>
  createOpenApiMcpServer({
    spec: "./openapi.yaml",
    baseUrl: "https://api.example.com",
    auth: { bearer: process.env.OPENAPI_MCP_BEARER },
  }),
);
```

`spec` can be a path, URL, or parsed document. Pass `specs` for more than one. `policy` accepts include/exclude globs, tags, methods, and path prefixes.

## Options

| Option | Role |
| --- | --- |
| `spec` | One spec (path, URL, or document). Required unless `specs` is set. |
| `specs` | More than one spec. Tool names get a prefix from the file name or `info.title`. |
| `baseUrl` | Override `servers[0].url`. |
| `headers` | Extra headers on every upstream request. |
| `auth` | `{ bearer, apiKey, basic, schemes }`. Same meaning as CLI flags. |
| `policy` | `{ include, exclude, tags, excludeTags, methods, pathPrefixes, namePrefix }`. |
| `confirmMutating` | Default on in the CLI. Mutating tools need `confirm: true`. |
| `retries` / `retryDelayMs` | 429 / 5xx / network retries. |
| `timeoutMs` | Upstream timeout. Default `20000`. |
| `maxResponseBytes` | Truncate huge bodies. Default `100000`. |
| `name` / `version` | MCP server identity. Defaults come from spec `info` or the package version. |
| `fetch` / `specFetch` | Inject HTTP for tests. |

## Other exports

Use these when you embed cabrakan without `createOpenApiMcpServer`:

- `loadOpenApiDocument` / `loadOpenApiDocumentEffect`
- `openApiToTools` / `operationToTool` / `toolNameFor`
- `applyToolPolicy`
- `buildRequest` / `executeToolRequest`
- `applyAuth` / `clearTokenCache`
- `resolveBaseUrl`
- `upgradeSwaggerDocument` / `isSwagger2`

Keep secrets out of logs. Treat the MCP host as trusted: this process calls the real HTTP API.
