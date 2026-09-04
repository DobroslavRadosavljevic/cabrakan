import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenApiMcpServer } from "../../src/server.ts";

const petsSpec = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/pets.yaml");
const securedSpec = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/secured.yaml");

describe("openapi mcp server", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
    fetchMock.mockReset();
  });

  it("lists tools from the spec and executes an HTTP call", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "p1", name: "Rex" }), { status: 200 }));

    const server = await createOpenApiMcpServer({ spec: petsSpec, fetch: fetchMock });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test", version: "0.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["getPet", "get_health", "update-pet"]);
    expect(tools.find((tool) => tool.name === "getPet")?.inputSchema).toMatchObject({
      type: "object",
      required: ["petId"],
    });

    const result = await client.callTool({
      name: "getPet",
      arguments: { petId: "p1", verbose: true },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).url).toBe("https://pets.example/pets/p1?verbose=true");
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("Rex");
  });

  it("applies bearer auth and reports HTTP errors as tool errors", async () => {
    fetchMock.mockResolvedValue(new Response("denied", { status: 403, statusText: "Forbidden" }));

    const server = await createOpenApiMcpServer({
      spec: securedSpec,
      fetch: fetchMock,
      auth: { bearer: "jwt-token" },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test", version: "0.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: "getPet", arguments: { petId: "p1" } });
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer jwt-token");
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/403/);
  });
});
