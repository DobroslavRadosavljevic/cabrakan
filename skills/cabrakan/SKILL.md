---
name: cabrakan
description: >-
  Install, configure, and run cabrakan, an OpenAPI-to-MCP server (CLI and
  TypeScript library). Use when adding cabrakan, turning OpenAPI or Swagger
  into MCP tools, wiring Cursor or Claude mcp.json, setting bearer, api-key,
  basic, or OAuth via flags or OPENAPI_MCP_* env vars, calling
  createOpenApiMcpServer, choosing --transport stdio or http, running
  --list-tools or --validate-spec, or fixing missing tools, auth, servers,
  operationId, or requestBody mapping.
license: MIT
compatibility: >-
  Requires Node ^22.18.0 or >=24.11.0. Bun 1.3 also runs the CLI. Needs an
  OpenAPI 3.x or Swagger 2.0 document. Needs network when the spec or upstream
  API is a remote URL.
metadata:
  author: Dobroslav Radosavljevic
  version: "0.0.1"
  source: https://github.com/DobroslavRadosavljevic/cabrakan/tree/main/skills/cabrakan
---

# cabrakan

cabrakan is an MCP server. **MCP** (Model Context Protocol) is the tool protocol. Point cabrakan at an OpenAPI 3.x or Swagger 2.0 file or URL. Each HTTP operation becomes a tool that calls the real API.

No codegen. No extra config file. Restart the process when the spec changes.

This skill is for **using** cabrakan in an app or agent host. It is not for changing the cabrakan source tree.

## When to use

Use this skill when the user asks to:

- Add or run `cabrakan`
- Expose an OpenAPI or Swagger API as MCP tools
- Wire Cursor, Claude, or another MCP host
- Set auth (`--bearer`, `--api-key`, `--basic`, `--oauth-*`, `OPENAPI_MCP_*`)
- Call `createOpenApiMcpServer`
- Fix empty tool lists, 401s, missing base URL, or bad tool names

Do not use this skill for generic OpenAPI codegen (that is a different tool).

## Workflow

1. Inspect the local surface:
   - Package: `cabrakan` in `package.json`, or a `cabrakan` / `bun src/cli.ts` command.
   - Spec: local path, `http(s)` URL, or a parsed document.
   - Host: Cursor `mcp.json`, Claude desktop config, stdio, or `--transport http`.
   - Auth: spec `security` / `securitySchemes` vs flags and `OPENAPI_MCP_*` env vars.
2. Load the spec before you wire the host:

   ```sh
   cabrakan ./openapi.yaml --validate-spec
   cabrakan ./openapi.yaml --list-tools
   ```

3. Read the matching reference (one file, on demand):
   - Spec contract, `operationId`, servers, security: [openapi-spec.md](references/openapi-spec.md)
   - CLI, env, Cursor/Claude, filters, HTTP transport: [cli.md](references/cli.md)
   - Library API (`createOpenApiMcpServer`): [library.md](references/library.md)
   - Cursor MCP template: [assets/mcp.cursor.json](assets/mcp.cursor.json)
4. Implement in the existing project style:
   - Prefer the CLI for Cursor / Claude.
   - Prefer the library when the process already owns stdio or HTTP.
   - Put secrets in flags or env. Never write secrets into the spec or into git.
5. Verify with the checks in [Verification](#verification).

## Judgment

- Runtime for the published CLI: Node `^22.18.0 || >=24.11.0`. Bun also runs `src/cli.ts`.
- Package is ESM-only. Do not add a CJS require unless a caller already needs it.
- Logs go to stderr. stdout is the MCP protocol (except `--list-tools` and `--version`).
- One tool per operation. Name comes from `operationId`, then `method_path`.
- Path parameters are always required. `{name}` in the path must match `in: path`.
- JSON `requestBody` (then `application/x-www-form-urlencoded`) becomes the `body` argument.
- `POST` / `PUT` / `PATCH` / `DELETE` need `confirm: true` unless `--no-confirm`.
- Empty `security: []` means no auth for that operation.
- First `servers` URL wins. Relative server URLs need a spec URL or `--base-url`.
- HTTP transport binds `127.0.0.1` by default. Do not bind `0.0.0.0` unless the user asks.
- `mutualTLS`, browser OAuth, multipart, and file uploads are not supported.
- Do not log bearer tokens, API keys, or basic passwords.

## Verification

Run the relevant subset. Prefer repo scripts when they exist.

- `cabrakan ./openapi.yaml --validate-spec` (or the spec URL).
- `cabrakan ./openapi.yaml --list-tools` and confirm names match `operationId`.
- Smoke one GET and one mutating call (`confirm: true` unless `--no-confirm`).
- Confirm auth: missing credentials fail; injected credentials do not appear as tool args.
- For Cursor: the process starts, logs stay on stderr, and tools appear in the host.

## Out of scope

- GitHub Actions for publish
- Editing `dist/`
- Committing secrets
- Building a second MCP protocol on stdout
