# cabrakan

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

## OpenAPI spec

cabrakan loads the document, then makes one MCP tool per HTTP operation. The spec must parse. The spec must also give enough data to build each request.

Check a file or URL:

```sh
cabrakan ./openapi.yaml --validate-spec
```

### Required

| Field | Why it matters |
| --- | --- |
| `openapi: "3.x.x"` or `swagger: "2.0"` | Other versions fail to load. Use JSON or YAML. |
| `info.title` and `info.version` | Valid OpenAPI needs these. The MCP server name can use the title. |
| `paths` with at least one method | Each `get`, `put`, `post`, `delete`, `patch`, `options`, `head`, or `trace` becomes a tool. Empty `paths` means no tools. |
| A base URL | Set `servers[0].url`, or pass `--base-url`. A relative server URL works when you load the spec from an `http(s)` URL. |

Put `{name}` in the path. Add a parameter with the same `name` and `in: path`.

Each operation needs `responses` so the document stays valid OpenAPI. cabrakan does not read response schemas when it calls the API.

### Recommended

| Field | Why it matters |
| --- | --- |
| `operationId` | This is the tool name. Keep it unique. Use letters, digits, `_`, and `-`. Start with a letter. Max 64 characters. Without it, the name is `method_path`. Duplicate names get a `_2` suffix. |
| `summary` and `description` | The model reads these as the tool description. |
| `parameters` with `schema` | These become tool arguments. Set `required: true` when the API needs the value. Path parameters are always required. |
| `requestBody` | This becomes the `body` argument. Prefer `application/json`, then `application/x-www-form-urlencoded`. Set `required: true` when the API needs a body. |
| `tags` | `--tag` and `--exclude-tag` filter on these. |

Give each parameter a unique `name` across path, query, header, and cookie. The same name in two places overwrites the tool argument.

### Servers

```yaml
servers:
  - url: https://api.example.com/v1
```

URL `{variables}` need a `default`:

```yaml
servers:
  - url: https://{env}.example.com/{base}
    variables:
      env:
        default: api
      base:
        default: v1
```

Operation or path `servers` override the document list. cabrakan uses the first URL in that list.

Swagger 2.0: set `host`. You can also set `schemes` and `basePath`.

### Auth in the spec

Protected operations need `security` and a matching entry in `components.securitySchemes`.

```yaml
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

Document `security` applies to every operation. An operation can set its own `security`. `security: []` means no auth for that operation.

One requirement can list more than one scheme (AND). More than one requirement is OR. The first requirement you can satisfy wins.

| Scheme | What cabrakan uses |
| --- | --- |
| `http` + `scheme: bearer` | `--bearer` |
| `http` + `scheme: basic` | `--basic user:pass` |
| `apiKey` in `header`, `query`, or `cookie` | `--api-key` |
| `oauth2` `clientCredentials` | `--oauth-client-id` + `--oauth-client-secret`. Token URL comes from the spec or `--oauth-token-url`. |
| `oauth2` or `openIdConnect` with a static token | `--oauth-token` or `--bearer` |

`mutualTLS` is not supported. Browser OAuth login is not supported.

Do not put secrets in the spec. Pass them as flags or `OPENAPI_MCP_*` env vars. See [Auth](#auth) for flags.

### `$ref`

Internal `$ref` values work. cabrakan resolves them before it builds tools.

Circular `$ref` chains are skipped. Keep schemas acyclic if the model must see the full body shape.

### Not used as tools

- Response bodies and examples (except that `responses` keep the spec valid)
- `webhooks` and `callbacks`
- `multipart/form-data` and file uploads
- `servers` entries after the first
- OAuth scopes

### Minimal spec

```yaml
openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
servers:
  - url: https://pets.example
paths:
  /pets/{petId}:
    get:
      operationId: getPet
      summary: Get a pet by id
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: ok
```

## Install

From a local pack:

```sh
bun run build
npm pack
bun add ./cabrakan-0.0.1.tgz
```

Or run from this repo:

```sh
bun src/cli.ts ./openapi.yaml
```

Node `^22.18` or `>=24.11`. Bun works.

## Run

This process **is** the MCP server. Logs go to stderr so stdout stays protocol.

```sh
cabrakan https://petstore3.swagger.io/api/v3/openapi.json
cabrakan ./openapi.yaml --bearer "$TOKEN"
cabrakan ./openapi.yaml --list-tools
cabrakan --version
```

### Cursor

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": [
        "-y",
        "cabrakan",
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
cabrakan ./openapi.yaml --transport http --port 3000
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
cabrakan ./openapi.yaml --tag pets --exclude-tag admin --method GET
cabrakan --spec pets.yaml --spec store.yaml
cabrakan ./openapi.yaml --no-confirm
```

Repeat `--spec` to merge APIs. Mutating tools wait for `confirm: true` unless you disable that.

## Library

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

## CLI reference

```
cabrakan <spec> [options]
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

There is no GitHub CI. You publish from this machine with Bun. npm 2FA uses the browser.

1. `bun install`
2. One-time: `bun run login` (opens npm web login; complete 2FA in the browser)
3. Check the account: `bun pm whoami`
4. Dry run: `bun run pack:dry`
5. Publish: `bun run release`

`prepack` already runs typecheck, unit tests, and build before the tarball is written. `bun publish` uses `--auth-type=web` so npm can open the 2FA page if the registry asks for it. Do not name a script `publish`; npm/Bun treat that as a post-publish hook.

## Agent skill

This repo ships an [Agent Skill](https://agentskills.io/specification) at `skills/cabrakan/`. After the GitHub repo is public, install it with:

```sh
npx skills add DobroslavRadosavljevic/cabrakan
```

[skills.sh](https://skills.sh/) indexes public GitHub repos that contain a valid `SKILL.md` (`name` + `description`) under `skills/` or `.agents/skills/`. The public skill lives in `skills/cabrakan/`. Other folders under `.agents/skills/` are local third-party skills. Move or omit those before you want a clean listing.

## License

MIT
