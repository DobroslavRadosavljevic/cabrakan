import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { applyAuth, clearTokenCache } from "../../src/auth.ts";
import { buildRequest } from "../../src/http.ts";
import { loadOpenApiDocument } from "../../src/load-spec.ts";
import { openApiToTools } from "../../src/tools.ts";
import type { FetchLike, OpenApiMcpTool, SecurityScheme } from "../../src/types.ts";

const securedPath = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/secured.yaml");

const emptyTool: OpenApiMcpTool = {
  name: "ping",
  description: "GET /ping",
  method: "get",
  path: "/ping",
  locations: {},
  inputSchema: { type: "object" },
  parameters: [],
  security: undefined,
};

const schemes: Record<string, SecurityScheme> = {
  api_key: { type: "apiKey", name: "X-API-Key", in: "header" },
  query_key: { type: "apiKey", name: "api_key", in: "query" },
  cookie_key: { type: "apiKey", name: "sid", in: "cookie" },
  bearer_auth: { type: "http", scheme: "bearer" },
  basic_auth: { type: "http", scheme: "basic" },
  oauth: {
    type: "oauth2",
    flows: { clientCredentials: { tokenUrl: "https://auth.example/token" } },
  },
  oidc: { type: "openIdConnect", openIdConnectUrl: "https://auth.example/.well-known" },
};

afterEach(() => {
  clearTokenCache();
});

describe("applyAuth", () => {
  it("injects apiKey into header, query, or cookie", async () => {
    const header = await applyAuth({
      tool: { ...emptyTool, security: [{ api_key: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { apiKey: "k" },
      fetch,
    });
    expect(header.headers["X-API-Key"]).toBe("k");

    const query = await applyAuth({
      tool: { ...emptyTool, security: [{ query_key: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { schemes: { query_key: { value: "q" } } },
      fetch,
    });
    expect(query.query).toEqual([{ name: "api_key", value: "q" }]);

    const cookie = await applyAuth({
      tool: { ...emptyTool, security: [{ cookie_key: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { schemes: { cookie_key: { value: "c" } } },
      fetch,
    });
    expect(cookie.cookies).toEqual(["sid=c"]);
  });

  it("injects HTTP bearer and basic credentials", async () => {
    const bearer = await applyAuth({
      tool: { ...emptyTool, security: [{ bearer_auth: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { bearer: "tok" },
      fetch,
    });
    expect(bearer.headers.Authorization).toBe("Bearer tok");

    const basic = await applyAuth({
      tool: { ...emptyTool, security: [{ basic_auth: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { basic: "user:pass" },
      fetch,
    });
    expect(basic.headers.Authorization).toBe(`Basic ${btoa("user:pass")}`);
  });

  it("fetches an OAuth2 client-credentials token and caches it", async () => {
    let tokenCalls = 0;
    const fetchFn: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/token")) {
        tokenCalls += 1;
        return new Response(JSON.stringify({ access_token: "access-1", expires_in: 3600 }), { status: 200 });
      }
      return new Response("nope", { status: 500 });
    };

    const first = await applyAuth({
      tool: { ...emptyTool, security: [{ oauth: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { schemes: { oauth: { clientId: "id", clientSecret: "secret" } } },
      fetch: fetchFn,
    });
    const second = await applyAuth({
      tool: { ...emptyTool, security: [{ oauth: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { schemes: { oauth: { clientId: "id", clientSecret: "secret" } } },
      fetch: fetchFn,
    });
    expect(first.headers.Authorization).toBe("Bearer access-1");
    expect(second.headers.Authorization).toBe("Bearer access-1");
    expect(tokenCalls).toBe(1);
  });

  it("uses a bearer token for openIdConnect schemes", async () => {
    const applied = await applyAuth({
      tool: { ...emptyTool, security: [{ oidc: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { bearer: "id-token" },
      fetch,
    });
    expect(applied.headers.Authorization).toBe("Bearer id-token");
  });

  it("picks the first OR requirement that has credentials", async () => {
    const applied = await applyAuth({
      tool: { ...emptyTool, security: [{ basic_auth: [] }, { bearer_auth: [] }] },
      documentSchemes: schemes,
      documentSecurity: undefined,
      auth: { bearer: "tok" },
      fetch,
    });
    expect(applied.headers.Authorization).toBe("Bearer tok");
  });

  it("skips auth when operation security is an empty list", async () => {
    const applied = await applyAuth({
      tool: { ...emptyTool, security: [] },
      documentSchemes: schemes,
      documentSecurity: [{ bearer_auth: [] }],
      auth: { bearer: "tok" },
      fetch,
    });
    expect(applied.headers.Authorization).toBeUndefined();
  });

  it("fails closed when required credentials are missing", async () => {
    await expect(
      applyAuth({
        tool: { ...emptyTool, security: [{ api_key: [] }] },
        documentSchemes: schemes,
        documentSecurity: undefined,
        fetch,
      }),
    ).rejects.toThrow(/Missing credentials/);
  });
});

describe("auth on the wire", () => {
  it("sends the api key header from the secured spec", async () => {
    const document = await loadOpenApiDocument(securedPath);
    const tool = openApiToTools(document).find((item) => item.name === "updatePet");
    expect(tool).toBeDefined();
    const request = await buildRequest(tool!, { petId: "1", body: { name: "Rex" } }, {
      document,
      auth: { apiKey: "secret-key" },
    });
    expect(request.headers.get("X-API-Key")).toBe("secret-key");
    expect(request.url).toBe("https://api.pets.example/v1/pets/1");
  });
});
