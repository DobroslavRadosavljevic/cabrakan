import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadOpenApiDocument } from "../../src/load-spec.ts";
import { openApiToTools, toolNameFor } from "../../src/tools.ts";

const petsPath = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/pets.yaml");
const securedPath = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/secured.yaml");
const refsPath = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/refs.yaml");

describe("tool names", () => {
  it("uses a valid operationId", () => {
    expect(toolNameFor("get", "/pets/{petId}", "getPet")).toBe("getPet");
  });

  it("sanitizes illegal operationId characters to the MCP name pattern", () => {
    expect(toolNameFor("post", "/pets/{petId}", "update-pet!")).toBe("update-pet");
  });

  it("falls back to method and path", () => {
    expect(toolNameFor("get", "/health")).toBe("get_health");
  });

  it("uniquifies duplicate names", () => {
    const tools = openApiToTools({
      openapi: "3.1.0",
      paths: {
        "/a": { get: { operationId: "same" } },
        "/b": { get: { operationId: "same" } },
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["same", "same_2"]);
  });
});

describe("input schemas", () => {
  it("maps path, query, and JSON body into one object schema", async () => {
    const tools = openApiToTools(await loadOpenApiDocument(petsPath));
    const getPet = tools.find((tool) => tool.name === "getPet");
    const updatePet = tools.find((tool) => tool.name === "update-pet");
    const health = tools.find((tool) => tool.name === "get_health");

    expect(getPet?.inputSchema).toMatchObject({
      type: "object",
      required: ["petId"],
      properties: {
        petId: { type: "string" },
        verbose: { type: "boolean" },
      },
    });
    expect(getPet?.locations).toEqual({ petId: "path", verbose: "query" });
    expect(updatePet?.inputSchema.required).toEqual(["petId", "body"]);
    expect(health?.inputSchema.properties).toEqual({});
  });

  it("resolves $ref parameters after dereference", async () => {
    const tools = openApiToTools(await loadOpenApiDocument(refsPath));
    expect(tools[0]?.parameters[0]).toMatchObject({ name: "itemId", in: "path", required: true });
    expect(tools[0]?.inputSchema.required).toEqual(["itemId"]);
  });

  it("does not expose apiKey security parameters as tool arguments", async () => {
    const tools = openApiToTools(await loadOpenApiDocument(securedPath));
    const updatePet = tools.find((tool) => tool.name === "updatePet");
    expect(updatePet?.inputSchema.properties).not.toHaveProperty("X-API-Key");
    expect(updatePet?.security).toEqual([{ api_key: [] }]);
  });

  it("keeps optional security as an empty requirement list", async () => {
    const tools = openApiToTools(await loadOpenApiDocument(securedPath));
    const login = tools.find((tool) => tool.name === "login");
    expect(login?.security).toEqual([]);
    expect(login?.contentType).toContain("www-form-urlencoded");
  });
});
