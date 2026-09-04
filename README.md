# sobek

Point this at an OpenAPI file or URL. You get a local **MCP** (Model Context Protocol) server. Each API operation is a tool that hits the real HTTP API.

No codegen. No extra config file. Restart when the spec changes.

This is **0.0.1**. APIs can still change.

## Features

- **OpenAPI 3.x and Swagger 2.0** — load JSON or YAML from a path or `http(s)` URL.
- **One tool per operation** — names come from `operationId`, then `method_path`.
- **Auth from the spec** — bearer, basic, API keys, OAuth2 client credentials, static OAuth tokens. Empty `security: []` means no auth.
- **Relative `servers` URLs** — resolved against the spec URL (Petstore-style `/api/v3` works).
- **Filters** — include/exclude tool names, tags, HTTP methods, path prefixes. Load more than one spec; tool names get a prefix.
- **Safer writes** — `POST` / `PUT` / `PATCH` / `DELETE` need `confirm: true` unless you pass `--no-confirm`.
- **Retries and limits** — retry 429/5xx/network, time out, truncate huge bodies.
- **stdio or HTTP** — stdio for Cursor / Claude. `--transport http` for Streamable HTTP on localhost.

## Install

From a local pack:

```sh
bun run build
npm pack
bun add ./sobek-0.0.1.tgz
```

Or run from this repo:

```sh
bun src/cli.ts ./openapi.yaml
```

Node `^22.18` or `>=24.11`. Bun works.

## Run

This process **is** the MCP server. Logs go to stderr so stdout stays protocol.

```sh
sobek https://petstore3.swagger.io/api/v3/openapi.json
sobek ./openapi.yaml --bearer "$TOKEN"
sobek ./openapi.yaml --list-tools
sobek --version
```

### Cursor

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": [
        "-y",
        "sobek",
        "https://api.example.com/openapi.json",
        "--bearer",
        "YOUR_TOKEN"
      ]
    }
  }
}
```

From this repo (dev):

```json
{
  "mcpServers": {
    "petstore": {
      "command": "bun",
      "args": [
        "src/cli.ts",
        "https://petstore3.swagger.io/api/v3/openapi.json",
        "--api-key",
        "special-key",
        "--bearer",
        "special-key"
      ]
    }
  }
}
```

### HTTP transport

```sh
sobek ./openapi.yaml --transport http --port 3000
```

Listens on `http://127.0.0.1:3000/mcp` (`/health` is plain `ok`).

## Auth

Credentials are injected from the spec’s `securitySchemes`. The model does not pass secrets as tool args.

| Scheme | Flag / env |
| --- | --- |
| HTTP bearer | `--bearer` / `OPENAPI_MCP_BEARER` |
| HTTP basic | `--basic user:pass` / `OPENAPI_MCP_BASIC` |
| `apiKey` (header, query, or cookie) | `--api-key` / `OPENAPI_MCP_API_KEY` |
| OAuth2 access token | `--oauth-token` or `--bearer` |
| OAuth2 client credentials | `--oauth-client-id` + `--oauth-client-secret` (+ `--oauth-token-url`) |

OR security: first requirement you can satisfy wins. `-H "Name: value"` always merges onto the request.

## Filters and safety

```sh
sobek ./openapi.yaml --tag pets --exclude-tag admin --method GET
sobek --spec pets.yaml --spec store.yaml
sobek ./openapi.yaml --no-confirm
```

Repeat `--spec` to merge APIs. Mutating tools wait for `confirm: true` unless you disable that.

## Library

```ts
import { createOpenApiMcpServer } from "sobek";
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

## CLI reference

```
sobek <spec> [options]
```

| Option | What it does |
| --- | --- |
| `--spec, -s` | Spec path or URL (repeatable) |
| `--base-url` | Override `servers[0].url` |
| `-H, --header` | Extra header (`Name: value`) |
| `--bearer` / `--api-key` / `--basic` | Auth |
| `--oauth-*` / `--auth-scheme` | OAuth2 / named scheme |
| `--transport` | `stdio` (default) or `http` |
| `--host` / `--port` | HTTP bind (`127.0.0.1:3000`) |
| `--include` / `--exclude` | Tool name globs |
| `--tag` / `--exclude-tag` | OpenAPI tags |
| `--method` / `--path-prefix` | Method and path filters |
| `--retries` / `--retry-delay-ms` | 429/5xx/network retries |
| `--timeout-ms` / `--max-response-bytes` | Timeouts and truncation |
| `--no-confirm` | Skip write confirmation |
| `--list-tools` / `--validate-spec` | Print tools / load spec, then exit |
| `--server-version` | Version string the MCP server reports to clients |
| `--version, -V` | Print the npm package version and exit |

## Local publish

There is no GitHub CI. You pack and publish from this machine.

1. `bun install`
2. `bun run typecheck && bun run test && bun run build`
3. Optional live check: `bun run test:integration`
4. `npm pack --dry-run` then `npm pack`
5. Smoke the tarball: `node dist/cli.mjs --version` (must print `0.0.1`)
6. If you publish to npm: `npm login` then `npm publish`

`prepack` already runs typecheck, unit tests, and build when you `npm pack` or `npm publish`.

## License

MIT
