import { describe, expect, it } from "vitest";
import { loadOpenApiDocument } from "../../src/load-spec.ts";
import { openApiToTools } from "../../src/tools.ts";

const PETSTORE = "https://petstore3.swagger.io/api/v3/openapi.json";

describe("public OpenAPI URL", () => {
  it("loads Swagger Petstore 3 and maps operations to tools", async () => {
    let document;
    try {
      document = await loadOpenApiDocument(PETSTORE);
    } catch (error) {
      expect.fail(`Could not fetch ${PETSTORE}: ${error instanceof Error ? error.message : String(error)}`);
    }
    expect(document.openapi?.startsWith("3.")).toBe(true);
    const tools = openApiToTools(document);
    expect(tools.length).toBeGreaterThan(5);
    expect(tools.some((tool) => tool.method === "get" && tool.path.includes("/pet"))).toBe(true);
  });
});
