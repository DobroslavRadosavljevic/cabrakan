import SwaggerParser from "@apidevtools/swagger-parser";
import { Effect } from "effect";
import { parse as parseYaml } from "yaml";
import { SpecError } from "./errors.ts";
import { runApp } from "./runtime.ts";
import { SpecHttp } from "./services.ts";
import { upgradeSwaggerDocument } from "./swagger.ts";
import type { FetchLike, OpenApiDocument } from "./types.ts";

export type SpecSource = string | OpenApiDocument;
export type LoadOpenApiDocumentOptions = {
  fetch?: FetchLike;
};

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const parseOpenApiTextEffect = (text: string, source: string): Effect.Effect<unknown, SpecError> =>
  Effect.gen(function* () {
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (!trimmed) {
      return yield* new SpecError({ message: `Empty OpenAPI document from ${source}` });
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return yield* Effect.try({
        try: () => JSON.parse(trimmed) as unknown,
        catch: (error) =>
          new SpecError({
            message: `Invalid JSON OpenAPI document from ${source}: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });
    }
    return yield* Effect.try({
      try: () => parseYaml(trimmed) as unknown,
      catch: (error) =>
        new SpecError({
          message: `Invalid YAML OpenAPI document from ${source}: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  });

export function parseOpenApiText(text: string, source: string): unknown {
  return Effect.runSync(parseOpenApiTextEffect(text, source));
}

const fetchOpenApiDocument = (url: string): Effect.Effect<unknown, SpecError, SpecHttp> =>
  Effect.gen(function* () {
    const { fetch } = yield* SpecHttp;
    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (error) =>
        new SpecError({
          message: `Failed to fetch OpenAPI document from ${url}: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
    if (!response.ok) {
      return yield* new SpecError({
        message: `Failed to fetch OpenAPI document from ${url}: ${response.status} ${response.statusText}`.trim(),
      });
    }
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) =>
        new SpecError({
          message: `Failed to read OpenAPI document from ${url}: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
    return yield* parseOpenApiTextEffect(text, url);
  });

export const loadOpenApiDocumentEffect = (
  spec: SpecSource,
): Effect.Effect<OpenApiDocument, SpecError, SpecHttp> =>
  Effect.gen(function* () {
    const source =
      typeof spec === "string" && isHttpUrl(spec) ? yield* fetchOpenApiDocument(spec) : spec;

    const document = yield* Effect.tryPromise({
      try: () =>
        SwaggerParser.dereference(source as never, {
          dereference: { circular: "ignore" },
        }) as Promise<OpenApiDocument>,
      catch: (error) =>
        new SpecError({
          message: `Failed to parse OpenAPI document: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    if (!document.openapi && !document.swagger) {
      return yield* new SpecError({ message: "Document is not an OpenAPI or Swagger specification" });
    }
    const upgraded = document.swagger && !document.openapi ? upgradeSwaggerDocument(document) : document;
    const version = upgraded.openapi ?? "";
    if (!version.startsWith("3.")) {
      return yield* new SpecError({
        message: `Unsupported OpenAPI version "${version}". Only OpenAPI 3.x is supported.`,
      });
    }
    return upgraded;
  });

export async function loadOpenApiDocument(
  spec: SpecSource,
  options: LoadOpenApiDocumentOptions = {},
): Promise<OpenApiDocument> {
  return runApp(loadOpenApiDocumentEffect(spec), { specFetch: options.fetch, fetch: options.fetch });
}
