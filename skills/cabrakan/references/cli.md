# CLI, host, and auth

The `cabrakan` process **is** the MCP server. Logs go to stderr so stdout stays protocol.

## Install and run

Published CLI needs Node `^22.18.0 || >=24.11.0`. Bun also works.

```sh
cabrakan https://petstore3.swagger.io/api/v3/openapi.json
cabrakan ./openapi.yaml --bearer "$TOKEN"
cabrakan ./openapi.yaml --list-tools
cabrakan ./openapi.yaml --validate-spec
cabrakan --version
```

From the cabrakan repo (dev):

```sh
bun src/cli.ts ./openapi.yaml
```

## Cursor

Use `npx` after publish, or `bun src/cli.ts` from this repo.

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

Prefer env for secrets. See [mcp.cursor.json](../assets/mcp.cursor.json).

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

Claude desktop and other stdio hosts use the same command + args shape.

## HTTP transport

```sh
cabrakan ./openapi.yaml --transport http --port 3000
```

Listens on `http://127.0.0.1:3000/mcp` (`/health` is plain `ok`).

Default bind is `127.0.0.1`. Do not pass `--host 0.0.0.0` unless the user asks.

## Auth

Credentials come from flags and `OPENAPI_MCP_*` env vars. The model does not pass secrets as tool args.

| Scheme | Flag / env |
| --- | --- |
| HTTP bearer | `--bearer` / `OPENAPI_MCP_BEARER` |
| HTTP basic | `--basic user:pass` / `OPENAPI_MCP_BASIC` |
| `apiKey` (header, query, or cookie) | `--api-key` / `OPENAPI_MCP_API_KEY` |
| OAuth2 access token | `--oauth-token` or `--bearer` |
| OAuth2 client credentials | `--oauth-client-id` + `--oauth-client-secret` (+ `--oauth-token-url`) |

Named scheme: `--auth-scheme <name>` when more than one OAuth or API-key scheme exists.

OR security: first requirement you can satisfy wins. `-H "Name: value"` always merges onto the request.

Do not log these values.

## Filters and safety

```sh
cabrakan ./openapi.yaml --tag pets --exclude-tag admin --method GET
cabrakan --spec pets.yaml --spec store.yaml
cabrakan ./openapi.yaml --no-confirm
```

Repeat `--spec` to merge APIs. Tool names get a prefix. Mutating tools wait for `confirm: true` unless you pass `--no-confirm`.

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
