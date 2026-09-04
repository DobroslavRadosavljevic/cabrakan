import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { isHttpUrl, loadOpenApiDocument, parseOpenApiText } from "../../src/load-spec.ts";
import type { FetchLike } from "../../src/types.ts";

const petsYaml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../fixtures/pets.yaml"),
  "utf8",
);

describe("isHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isHttpUrl("https://petstore3.swagger.io/api/v3/openapi.json")).toBe(true);
    expect(isHttpUrl("http://localhost:8080/openapi.yaml")).toBe(true);
  });

  it("rejects file paths and other schemes", () => {
    expect(isHttpUrl("./openapi.yaml")).toBe(false);
    expect(isHttpUrl("/tmp/openapi.yaml")).toBe(false);
    expect(isHttpUrl("file:///tmp/openapi.yaml")).toBe(false);
  });
});

describe("parseOpenApiText", () => {
  it("parses JSON and YAML documents", () => {
    const json = parseOpenApiText('{"openapi":"3.1.0","info":{"title":"A","version":"1"}}', "mem");
    const yaml = parseOpenApiText(petsYaml, "pets.yaml") as { info?: { title?: string } };
    expect(json).toMatchObject({ openapi: "3.1.0" });
    expect(yaml.info?.title).toBe("Pets");
  });
});

describe("loadOpenApiDocument from URL", () => {
  it("fetches YAML from https and dereferences it", async () => {
    const fetchFn: FetchLike = vi.fn(async () => new Response(petsYaml, { status: 200 }));
    const document = await loadOpenApiDocument("https://example.test/pets.yaml", { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("https://example.test/pets.yaml");
    expect(document.info?.title).toBe("Pets");
    expect(document.paths?.["/pets/{petId}"]?.get?.operationId).toBe("getPet");
  });

  it("fetches JSON from https", async () => {
    const body = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Remote", version: "1" },
      paths: { "/ping": { get: { operationId: "ping", responses: { "200": { description: "ok" } } } } },
    });
    const document = await loadOpenApiDocument("https://example.test/openapi.json", {
      fetch: async () => new Response(body, { status: 200 }),
    });
    expect(document.info?.title).toBe("Remote");
    expect(document.paths?.["/ping"]?.get?.operationId).toBe("ping");
  });

  it("fails on a non-OK response", async () => {
    await expect(
      loadOpenApiDocument("https://example.test/missing.json", {
        fetch: async () => new Response("nope", { status: 404, statusText: "Not Found" }),
      }),
    ).rejects.toThrow(/Failed to fetch OpenAPI document.*404/);
  });
});
