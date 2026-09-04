import { describe, expect, it } from "vitest";
import { applyToolPolicy } from "../../src/policy.ts";
import type { OpenApiMcpTool } from "../../src/types.ts";

const getPet: OpenApiMcpTool = {
  name: "getPet",
  description: "get",
  method: "get",
  path: "/pets/{petId}",
  inputSchema: { type: "object" },
  locations: {},
  parameters: [],
  security: undefined,
  tags: ["pets"],
};

const deletePet: OpenApiMcpTool = {
  ...getPet,
  name: "deletePet",
  method: "delete",
  tags: ["pets", "admin"],
  requiresConfirmation: true,
};

describe("tool policy", () => {
  it("filters by tag, method, path prefix, and name glob", () => {
    const tools = [getPet, deletePet];
    expect(applyToolPolicy(tools, { tags: ["admin"] }).map((tool) => tool.name)).toEqual(["deletePet"]);
    expect(applyToolPolicy(tools, { excludeTags: ["admin"] }).map((tool) => tool.name)).toEqual(["getPet"]);
    expect(applyToolPolicy(tools, { methods: ["get"] }).map((tool) => tool.name)).toEqual(["getPet"]);
    expect(applyToolPolicy(tools, { include: ["get*"] }).map((tool) => tool.name)).toEqual(["getPet"]);
    expect(applyToolPolicy(tools, { exclude: ["*delete*"] }).map((tool) => tool.name)).toEqual(["getPet"]);
    expect(applyToolPolicy(tools, { pathPrefixes: ["/store"] })).toEqual([]);
  });

  it("prefixes names for multi-spec servers", () => {
    expect(applyToolPolicy([getPet], { namePrefix: "petstore_" })[0]?.name).toBe("petstore_getPet");
  });
});
