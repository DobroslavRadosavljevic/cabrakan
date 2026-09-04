import { describe, expect, it } from "vitest";
import { parseCli } from "../../src/cli-options.ts";

describe("parseCli", () => {
  it("accepts a positional file path or URL", () => {
    expect(parseCli(["./openapi.yaml"])).toMatchObject({ spec: "./openapi.yaml" });
    expect(parseCli(["https://petstore3.swagger.io/api/v3/openapi.json"])).toMatchObject({
      spec: "https://petstore3.swagger.io/api/v3/openapi.json",
    });
  });

  it("accepts --spec and auth flags", () => {
    expect(
      parseCli([
        "--spec",
        "https://example.com/openapi.yaml",
        "--base-url",
        "https://api.example.com",
        "-H",
        "X-Debug: 1",
        "--bearer",
        "tok",
      ]),
    ).toMatchObject({
      spec: "https://example.com/openapi.yaml",
      baseUrl: "https://api.example.com",
      headers: { "X-Debug": "1" },
      auth: { bearer: "tok" },
    });
  });

  it("requires a spec", () => {
    expect(parseCli([])).toEqual({ error: "Missing OpenAPI spec. Pass a file path, URL, or --spec." });
  });

  it("prints package version without a spec", () => {
    expect(parseCli(["--version"])).toEqual({ showVersion: true });
    expect(parseCli(["-V"])).toEqual({ showVersion: true });
  });

  it("accepts --server-version for the MCP server string", () => {
    expect(parseCli(["./openapi.yaml", "--server-version", "9.9.9"])).toMatchObject({
      spec: "./openapi.yaml",
      version: "9.9.9",
    });
  });
});
