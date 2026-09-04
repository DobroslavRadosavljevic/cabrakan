import { describe, expect, it } from "vitest";
import { buildRequest, executeToolRequest, resolveBaseUrl } from "../../src/http.ts";
import type { OpenApiMcpTool } from "../../src/types.ts";

const getPet: OpenApiMcpTool = {
  name: "getPet",
  description: "GET /pets/{petId}",
  method: "get",
  path: "/pets/{petId}",
  locations: { petId: "path", verbose: "query", token: "header", session: "cookie" },
  inputSchema: { type: "object" },
  parameters: [
    { name: "petId", in: "path", required: true, schema: { type: "string" } },
    { name: "verbose", in: "query", schema: { type: "boolean" } },
    { name: "token", in: "header", schema: { type: "string" } },
    { name: "session", in: "cookie", schema: { type: "string" } },
  ],
  security: undefined,
};

describe("base URL", () => {
  it("requires a base URL or server", () => {
    expect(() => resolveBaseUrl(undefined, [])).toThrow(/base URL/);
    expect(resolveBaseUrl("https://api.example/", [{ url: "https://ignored" }])).toBe("https://api.example");
  });

  it("expands OpenAPI server variables using defaults", () => {
    expect(
      resolveBaseUrl(undefined, [
        {
          url: "https://{env}.example/{base}",
          variables: { env: { default: "api" }, base: { default: "v1" } },
        },
      ]),
    ).toBe("https://api.example/v1");
  });

  it("resolves a relative server URL against the spec URL", () => {
    expect(
      resolveBaseUrl(undefined, [{ url: "/api/v3" }], "https://petstore3.swagger.io/api/v3/openapi.json"),
    ).toBe("https://petstore3.swagger.io/api/v3");
  });
});

describe("request mapping", () => {
  it("builds path, query, header, and cookie parameters", async () => {
    const request = await buildRequest(
      getPet,
      { petId: "abc 1", verbose: true, token: "secret", session: "s1" },
      { baseUrl: "https://pets.example", headers: { Authorization: "Bearer x" } },
    );
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://pets.example/pets/abc%201?verbose=true");
    expect(request.headers.get("Authorization")).toBe("Bearer x");
    expect(request.headers.get("token")).toBe("secret");
    expect(request.headers.get("cookie")).toBe("session=s1");
  });

  it("serializes exploded query arrays and deepObject filters", async () => {
    const tool: OpenApiMcpTool = {
      ...getPet,
      parameters: [
        { name: "petId", in: "path", required: true },
        { name: "tags", in: "query", style: "form", explode: true },
        { name: "filter", in: "query", style: "deepObject", explode: true },
      ],
      locations: { petId: "path", tags: "query", filter: "query" },
    };
    const request = await buildRequest(
      tool,
      { petId: "1", tags: ["a", "b"], filter: { status: "open" } },
      { baseUrl: "https://pets.example" },
    );
    expect(request.url).toBe("https://pets.example/pets/1?tags=a&tags=b&filter%5Bstatus%5D=open");
  });

  it("encodes JSON and form bodies with the declared content type", async () => {
    const jsonTool: OpenApiMcpTool = {
      ...getPet,
      method: "post",
      locations: { petId: "path", body: "body" },
      contentType: "application/json",
    };
    const jsonRequest = await buildRequest(jsonTool, { petId: "1", body: { name: "Rex" } }, { baseUrl: "https://pets.example" });
    expect(jsonRequest.headers.get("content-type")).toBe("application/json");
    expect(await jsonRequest.text()).toBe('{"name":"Rex"}');

    const formTool: OpenApiMcpTool = {
      ...jsonTool,
      contentType: "application/x-www-form-urlencoded",
    };
    const formRequest = await buildRequest(formTool, { petId: "1", body: { user: "a", pass: "b" } }, { baseUrl: "https://pets.example" });
    expect(formRequest.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await formRequest.text()).toBe("user=a&pass=b");
  });

  it("returns isError for missing required params and HTTP failures", async () => {
    const missing = await executeToolRequest(getPet, {}, { baseUrl: "https://pets.example" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/petId/);

    const failed = await executeToolRequest(getPet, { petId: "1" }, {
      baseUrl: "https://pets.example",
      fetch: async () => new Response("nope", { status: 401, statusText: "Unauthorized" }),
    });
    expect(failed.isError).toBe(true);
    expect(failed.text).toMatch(/401/);
  });

  it("retries retryable HTTP statuses then succeeds", async () => {
    let attempts = 0;
    const ok = await executeToolRequest(getPet, { petId: "1" }, {
      baseUrl: "https://pets.example",
      retries: 2,
      retryDelayMs: 0,
      fetch: async () => {
        attempts += 1;
        if (attempts < 3) {
          return new Response("busy", { status: 503, statusText: "Service Unavailable" });
        }
        return new Response("{\"ok\":true}", { status: 200, statusText: "OK" });
      },
    });
    expect(attempts).toBe(3);
    expect(ok.isError).toBe(false);
    expect(ok.text).toMatch(/ok/);
  });

  it("truncates oversized responses", async () => {
    const result = await executeToolRequest(getPet, { petId: "1" }, {
      baseUrl: "https://pets.example",
      maxResponseBytes: 20,
      retries: 0,
      fetch: async () => new Response("abcdefghijklmnopqrstuvwxyz", { status: 200, statusText: "OK" }),
    });
    expect(result.text).toMatch(/truncated/i);
  });

  it("requires confirmation for mutating tools when enabled", async () => {
    const createPet: OpenApiMcpTool = { ...getPet, name: "addPet", method: "post", path: "/pets", requiresConfirmation: true, locations: {} };
    const blocked = await executeToolRequest(createPet, {}, { baseUrl: "https://pets.example", confirmMutating: true });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/confirm/i);
  });
});
