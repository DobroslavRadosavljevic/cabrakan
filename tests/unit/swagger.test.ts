import { describe, expect, it } from "vitest";
import { loadOpenApiDocument } from "../../src/load-spec.ts";
import { openApiToTools } from "../../src/tools.ts";
import { upgradeSwaggerDocument } from "../../src/swagger.ts";

const swagger2 = {
  swagger: "2.0",
  info: { title: "Legacy", version: "1" },
  host: "pets.example",
  basePath: "/v1",
  schemes: ["https"],
  paths: {
    "/pets/{petId}": {
      get: {
        operationId: "getPet",
        tags: ["pets"],
        parameters: [
          { name: "petId", in: "path", required: true, type: "string" },
          { name: "verbose", in: "query", type: "boolean" },
        ],
      },
      post: {
        operationId: "updatePet",
        parameters: [{ name: "body", in: "body", required: true, schema: { type: "object" } }],
      },
    },
  },
};

describe("swagger 2", () => {
  it("upgrades host, path params, and body into OpenAPI 3", () => {
    const document = upgradeSwaggerDocument(swagger2);
    expect(document.openapi).toBe("3.0.3");
    expect(document.servers?.[0]?.url).toBe("https://pets.example/v1");
    const tools = openApiToTools(document);
    expect(tools.map((tool) => tool.name).sort()).toEqual(["getPet", "updatePet"]);
    expect(tools.find((tool) => tool.name === "getPet")?.locations).toEqual({ petId: "path", verbose: "query" });
    expect(tools.find((tool) => tool.name === "updatePet")?.requiresConfirmation).toBe(true);
  });

  it("loads a swagger 2 document through the spec loader", async () => {
    const document = await loadOpenApiDocument(swagger2 as never);
    expect(document.openapi?.startsWith("3.")).toBe(true);
    expect(openApiToTools(document).length).toBe(2);
  });
});
