# Changelog

## 0.0.1 — 2026-09-04

First local release of **cabrakan**.

- Load OpenAPI 3.x or Swagger 2.0 from a file path or `http(s)` URL.
- Expose each operation as an MCP tool on stdio or Streamable HTTP.
- Inject auth from the spec (`bearer`, basic, API keys, OAuth2 client credentials).
- Filter tools by name, tag, method, and path prefix. Merge more than one spec.
- Require `confirm: true` on mutating methods unless `--no-confirm`.
- Publish as a library (`createOpenApiMcpServer`) and as the `cabrakan` CLI.
