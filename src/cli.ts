#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Effect } from "effect";
import { CLI_HELP, parseCli } from "./cli-options.ts";
import { readPackageVersion } from "./package-version.ts";
import { serveMcpHttpEffect } from "./http-transport.ts";
import { loadOpenApiDocumentEffect } from "./load-spec.ts";
import { applyToolPolicyEffect } from "./policy.ts";
import { appLayer } from "./runtime.ts";
import { createOpenApiMcpServer, slugName } from "./server.ts";
import { openApiToTools } from "./tools.ts";

const program = Effect.gen(function* () {
  const parsed = parseCli(process.argv.slice(2));
  if ("help" in parsed) {
    process.stderr.write(CLI_HELP);
    process.exit(0);
  }
  if ("showVersion" in parsed) {
    process.stdout.write(`${readPackageVersion()}\n`);
    process.exit(0);
  }
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n\n${CLI_HELP}`);
    process.exit(1);
  }

  const documents = yield* Effect.forEach(parsed.specs, (spec) => loadOpenApiDocumentEffect(spec), {
    concurrency: 1,
  });
  const tools = yield* Effect.forEach(documents, (document, index) =>
    applyToolPolicyEffect(openApiToTools(document), {
      ...parsed.policy,
      namePrefix:
        parsed.specs.length > 1
          ? `${slugName(parsed.specs[index]?.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "") ?? `api${index + 1}`)}_`
          : undefined,
    }),
  ).pipe(Effect.map((groups) => groups.flat()));

  if (parsed.validateSpec) {
    process.stderr.write(`cabrakan: ${tools.length} tools from ${parsed.specs.length} spec(s)\n`);
    process.exit(0);
  }
  if (parsed.listTools) {
    process.stdout.write(tools.map((tool) => `${tool.method.toUpperCase()} ${tool.path}  ${tool.name}`).join("\n") + "\n");
    process.exit(0);
  }

  const createServer = () =>
    createOpenApiMcpServer({
      spec: parsed.spec,
      specs: parsed.specs,
      baseUrl: parsed.baseUrl,
      headers: parsed.headers,
      auth: parsed.auth,
      name: parsed.name,
      version: parsed.version,
      policy: parsed.policy,
      retries: parsed.retries,
      retryDelayMs: parsed.retryDelayMs,
      timeoutMs: parsed.timeoutMs,
      maxResponseBytes: parsed.maxResponseBytes,
      confirmMutating: !parsed.noConfirm,
    });

  if (parsed.transport === "http") {
    process.stderr.write(
      `cabrakan: ${documents.map((document) => document.info?.title ?? "API").join(", ")} (${tools.length} tools)\n`,
    );
    yield* serveMcpHttpEffect({
      createServer,
      host: parsed.host,
      port: parsed.port,
    });
    return;
  }

  process.stderr.write(
    `cabrakan: ${documents[0]?.info?.title ?? parsed.spec} (${tools.length} tools) on stdio\n`,
  );
  serveStdio(() => createServer(), {
    onerror: (error) => {
      process.stderr.write(`cabrakan: ${error.message}\n`);
    },
  });
});

await Effect.runPromise(program.pipe(Effect.provide(appLayer())));
