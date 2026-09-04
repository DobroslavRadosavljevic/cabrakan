# 🌋 cabrakan

**OpenAPI in. MCP tools out.**

Point cabrakan at an OpenAPI file or URL. You get a local **MCP** (Model Context Protocol) server. Each API operation becomes a tool that hits the real HTTP API.

No codegen. No extra config file. Restart when the spec changes.

> Early **0.0.1** — APIs can still change.

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.18%20%7C%7C%20%3E%3D24.11-339933)](package.json)
[![skills.sh](https://skills.sh/b/DobroslavRadosavljevic/cabrakan)](https://skills.sh/DobroslavRadosavljevic/cabrakan)

## 🤖 Agent skill

Teach an agent how to install, wire, and run cabrakan ([skills.sh](https://skills.sh/DobroslavRadosavljevic/cabrakan)):

```sh
npx skills add DobroslavRadosavljevic/cabrakan
```

## 🚀 Quick start

Needs Node `^22.18` or `>=24.11`. Bun works too.

```sh
npx -y cabrakan ./openapi.yaml --bearer "$TOKEN"
npx -y cabrakan ./openapi.yaml --list-tools
npx -y cabrakan --version
```

Or install the CLI:

```sh
npm i -g cabrakan
cabrakan ./openapi.yaml --bearer "$TOKEN"
```

Logs go to stderr. stdout stays the MCP protocol (except `--list-tools` and `--version`).

## ✨ What you get

| | |
| --- | --- |
| 📄 **OpenAPI 3.x & Swagger 2.0** | JSON or YAML, from a path or `http(s)` URL |
| 🧰 **One tool per operation** | Names from `operationId`, then `method_path` |
| 🔐 **Auth from the spec** | Bearer, basic, API keys, OAuth2 client credentials, static tokens. `security: []` means no auth |
| 🌐 **Relative `servers` URLs** | Resolved against the spec URL (Petstore-style `/api/v3` works) |
| 🎛️ **Filters** | Include/exclude names, tags, methods, path prefixes. Merge more than one spec |
| 🛡️ **Safer writes** | `POST` / `PUT` / `PATCH` / `DELETE` need `confirm: true` unless `--no-confirm` |
| 🔁 **Retries & limits** | Retry 429/5xx/network, time out, truncate huge bodies |
| 📡 **stdio or HTTP** | stdio for Cursor / Claude. `--transport http` on localhost |

## 🖱️ Cursor

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["-y", "cabrakan", "https://api.example.com/openapi.json"],
      "env": {
        "OPENAPI_MCP_BEARER": "YOUR_TOKEN"
      }
    }
  }
}
```

### HTTP transport

```sh
cabrakan ./openapi.yaml --transport http --port 3000
```

Listens on `http://127.0.0.1:3000/mcp`. `/health` returns plain `ok`.

## 🔐 Auth

Credentials come from the spec’s `securitySchemes`. The model does not pass secrets as tool args.

| Scheme | Flag / env |
| --- | --- |
| HTTP bearer | `--bearer` / `OPENAPI_MCP_BEARER` |
| HTTP basic | `--basic user:pass` / `OPENAPI_MCP_BASIC` |
| `apiKey` (header, query, or cookie) | `--api-key` / `OPENAPI_MCP_API_KEY` |
| OAuth2 access token | `--oauth-token` or `--bearer` |
| OAuth2 client credentials | `--oauth-client-id` + `--oauth-client-secret` (+ `--oauth-token-url`) |

OR security: first requirement you can satisfy wins. `-H "Name: value"` always merges onto the request.

## 🎛️ Filters and safety

```sh
cabrakan ./openapi.yaml --tag pets --exclude-tag admin --method GET
cabrakan --spec pets.yaml --spec store.yaml
cabrakan ./openapi.yaml --no-confirm
```

Repeat `--spec` to merge APIs. Mutating tools wait for `confirm: true` unless you disable that.

## 📄 What the OpenAPI file needs

cabrakan loads the document, then makes one MCP tool per HTTP operation. The spec must parse. It must also give enough data to build each request.

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

Do not put secrets in the spec. Pass them as flags or `OPENAPI_MCP_*` env vars.

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

## 📚 Library

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

## 🛠️ CLI reference

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

## ⚖️ License

MIT
