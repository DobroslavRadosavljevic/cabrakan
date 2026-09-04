# OpenAPI spec contract

cabrakan loads the document, then makes one MCP tool per HTTP operation. The spec must parse. The spec must also give enough data to build each request.

Check a file or URL:

```sh
cabrakan ./openapi.yaml --validate-spec
```

## Required

| Field | Why it matters |
| --- | --- |
| `openapi: "3.x.x"` or `swagger: "2.0"` | Other versions fail to load. Use JSON or YAML. |
| `info.title` and `info.version` | Valid OpenAPI needs these. The MCP server name can use the title. |
| `paths` with at least one method | Each `get`, `put`, `post`, `delete`, `patch`, `options`, `head`, or `trace` becomes a tool. Empty `paths` means no tools. |
| A base URL | Set `servers[0].url`, or pass `--base-url`. A relative server URL works when you load the spec from an `http(s)` URL. |

Put `{name}` in the path. Add a parameter with the same `name` and `in: path`.

Each operation needs `responses` so the document stays valid OpenAPI. cabrakan does not read response schemas when it calls the API.

## Recommended

| Field | Why it matters |
| --- | --- |
| `operationId` | This is the tool name. Keep it unique. Use letters, digits, `_`, and `-`. Start with a letter. Max 64 characters. Without it, the name is `method_path`. Duplicate names get a `_2` suffix. |
| `summary` and `description` | The model reads these as the tool description. |
| `parameters` with `schema` | These become tool arguments. Set `required: true` when the API needs the value. Path parameters are always required. |
| `requestBody` | This becomes the `body` argument. Prefer `application/json`, then `application/x-www-form-urlencoded`. Set `required: true` when the API needs a body. |
| `tags` | `--tag` and `--exclude-tag` filter on these. |

Give each parameter a unique `name` across path, query, header, and cookie. The same name in two places overwrites the tool argument.

## Servers

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

## Auth in the spec

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

Do not put secrets in the spec. Pass them as flags or `OPENAPI_MCP_*` env vars. See [cli.md](cli.md).

## `$ref`

Internal `$ref` values work. cabrakan resolves them before it builds tools.

Circular `$ref` chains are skipped. Keep schemas acyclic if the model must see the full body shape.

## Not used as tools

- Response bodies and examples (except that `responses` keep the spec valid)
- `webhooks` and `callbacks`
- `multipart/form-data` and file uploads
- `servers` entries after the first
- OAuth scopes

## Minimal spec

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
