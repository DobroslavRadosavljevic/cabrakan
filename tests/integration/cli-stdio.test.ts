import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const spec = join(root, "tests/fixtures/pets.yaml");
const cli = join(root, "src/cli.ts");

describe("CLI stdio MCP server", () => {
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("starts from the CLI and lists tools for an agent", async () => {
    const transport = new StdioClientTransport({
      command: "bun",
      args: [cli, spec],
      cwd: root,
      stderr: "pipe",
    });
    client = new Client({ name: "cli-test", version: "0.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["getPet", "get_health", "update-pet"]);
  });
});
