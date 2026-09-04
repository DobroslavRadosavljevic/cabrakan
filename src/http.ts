import { Effect, Schedule } from "effect";
import { applyAuthEffect } from "./auth.ts";
import { AuthError, HttpError, RequestBuildError } from "./errors.ts";
import { runApp } from "./runtime.ts";
import { ApiHttp, TokenCache } from "./services.ts";
import { serializeCookie, serializeHeader, serializePath, serializeQuery } from "./serialize.ts";
import type { AuthOptions, FetchLike, OpenApiDocument, OpenApiMcpTool, OpenApiServer } from "./types.ts";

export type ExecuteRequestOptions = {
  baseUrl?: string;
  specUrl?: string;
  headers?: Record<string, string>;
  auth?: AuthOptions;
  fetch?: FetchLike;
  document?: OpenApiDocument;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  confirmMutating?: boolean;
};

export const expandServerUrlEffect = (server: OpenApiServer): Effect.Effect<string, RequestBuildError> =>
  Effect.gen(function* () {
    return yield* Effect.try({
      try: () =>
        server.url.replaceAll(/\{([^}]+)\}/g, (_match, name: string) => {
          const variable = server.variables?.[name];
          if (!variable || typeof variable.default !== "string") {
            throw new Error(`Server URL variable "{${name}}" has no default`);
          }
          return variable.default;
        }),
      catch: (error) =>
        new RequestBuildError({
          message: error instanceof Error ? error.message : String(error),
        }),
    });
  });

export function expandServerUrl(server: OpenApiServer): string {
  return Effect.runSync(expandServerUrlEffect(server));
}

export const resolveBaseUrlEffect = (
  explicit: string | undefined,
  servers: OpenApiServer[] | undefined,
  specUrl?: string,
): Effect.Effect<string, RequestBuildError> =>
  Effect.gen(function* () {
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }
    const server = servers?.[0];
    if (!server) {
      return yield* new RequestBuildError({
        message: "No base URL. Pass baseUrl or define servers[0].url in the OpenAPI document.",
      });
    }
    const expanded = (yield* expandServerUrlEffect(server)).replace(/\/$/, "");
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(expanded)) {
      return expanded;
    }
    if (!specUrl) {
      return yield* new RequestBuildError({
        message: `Relative server URL "${expanded}" needs a spec URL or an explicit baseUrl.`,
      });
    }
    try {
      return new URL(expanded || ".", specUrl).href.replace(/\/$/, "");
    } catch {
      return yield* new RequestBuildError({
        message: `Could not resolve server URL "${expanded}" against spec URL "${specUrl}".`,
      });
    }
  });

export function resolveBaseUrl(
  explicit: string | undefined,
  servers: OpenApiServer[] | undefined,
  specUrl?: string,
): string {
  return Effect.runSync(resolveBaseUrlEffect(explicit, servers, specUrl));
}

function joinUrl(base: string, path: string): URL {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

function encodeBody(value: unknown, contentType: string | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (contentType?.includes("application/x-www-form-urlencoded") && value && typeof value === "object") {
    const params = new URLSearchParams();
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(item)) {
        for (const entry of item) {
          params.append(key, String(entry));
        }
      } else if (item !== undefined && item !== null) {
        params.set(key, typeof item === "object" ? JSON.stringify(item) : String(item));
      }
    }
    return params.toString();
  }
  return JSON.stringify(value);
}

export const buildRequestEffect = (
  tool: OpenApiMcpTool,
  args: Record<string, unknown>,
  options: ExecuteRequestOptions,
): Effect.Effect<Request, RequestBuildError | AuthError, ApiHttp | TokenCache> =>
  Effect.gen(function* () {
    const document = options.document;
    const baseUrl = yield* resolveBaseUrlEffect(
      options.baseUrl,
      tool.servers ?? document?.servers,
      options.specUrl,
    );
    const auth = yield* applyAuthEffect({
      tool,
      documentSchemes: document?.components?.securitySchemes,
      documentSecurity: document?.security,
      auth: options.auth,
    });

    let pathname = tool.path;
    const queryPieces: Array<{ name: string; value: string; allowReserved?: boolean }> = [...auth.query];
    const headers = new Headers(options.headers);
    const cookies = [...auth.cookies];
    let body: unknown;

    for (const [name, value] of Object.entries(auth.headers)) {
      if (!headers.has(name)) {
        headers.set(name, value);
      }
    }

    for (const parameter of tool.parameters) {
      const value = args[parameter.name];
      if (value === undefined || value === null) {
        if (parameter.required || parameter.in === "path") {
          return yield* new RequestBuildError({
            message: `Missing required ${parameter.in} parameter "${parameter.name}"`,
          });
        }
        continue;
      }
      if (parameter.in === "path") {
        pathname = pathname.replaceAll(`{${parameter.name}}`, serializePath(parameter, value));
      } else if (parameter.in === "query") {
        queryPieces.push(...serializeQuery(parameter, value));
      } else if (parameter.in === "header") {
        headers.set(parameter.name, serializeHeader(parameter, value));
      } else if (parameter.in === "cookie") {
        cookies.push(serializeCookie(parameter, value));
      }
    }

    if (tool.locations.body && args.body !== undefined) {
      body = args.body;
    }

    if (cookies.length > 0) {
      const existing = headers.get("cookie");
      headers.set("cookie", [existing, ...cookies].filter(Boolean).join("; "));
    }

    const url = joinUrl(baseUrl, pathname);
    const search = queryPieces
      .map(
        (piece) =>
          `${encodeURIComponent(piece.name)}=${piece.allowReserved === true ? piece.value : encodeURIComponent(piece.value)}`,
      )
      .join("&");
    if (search) {
      url.search = search;
    }

    if (body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", tool.contentType ?? "application/json");
    }

    return new Request(url.toString(), {
      method: tool.method.toUpperCase(),
      headers,
      body: body === undefined ? undefined : encodeBody(body, tool.contentType ?? headers.get("content-type") ?? undefined),
    });
  });

export async function buildRequest(
  tool: OpenApiMcpTool,
  args: Record<string, unknown>,
  options: ExecuteRequestOptions,
): Promise<Request> {
  return runApp(buildRequestEffect(tool, args, options), { fetch: options.fetch });
}

const CONFIRM_ARG = "confirm";

function truncateBody(text: string, maxBytes: number | undefined): string {
  if (!maxBytes) {
    return text;
  }
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }
  let cut = maxBytes;
  while (cut > 0 && (bytes[cut] & 0b1100_0000) === 0b1000_0000) {
    cut -= 1;
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, cut));
  return `${prefix}\n\n... [truncated, ${bytes.length - cut} bytes omitted]`;
}

export const executeToolRequestEffect = (
  tool: OpenApiMcpTool,
  args: Record<string, unknown>,
  options: ExecuteRequestOptions,
): Effect.Effect<{ text: string; isError: boolean }, never, ApiHttp | TokenCache> =>
  Effect.gen(function* () {
    if (options.confirmMutating && tool.requiresConfirmation && args[CONFIRM_ARG] !== true) {
      return {
        isError: true as const,
        text: `Confirmation required for ${tool.method.toUpperCase()} ${tool.path}. Retry with { "${CONFIRM_ARG}": true }.`,
      };
    }

    const requestArgs = { ...args };
    delete requestArgs[CONFIRM_ARG];
    const retries = Math.max(0, options.retries ?? 2);
    const retryDelayMs = options.retryDelayMs ?? 0;
    const timeoutMs = options.timeoutMs ?? 20_000;
    const maxResponseBytes = options.maxResponseBytes ?? 100_000;

    // The Request is rebuilt per attempt: a Request body stream can only be
    // consumed once, so reusing it would make every retry fail.
    const attempt = Effect.gen(function* () {
      const request = yield* buildRequestEffect(tool, requestArgs, options);
      const { fetch } = yield* ApiHttp;
      const response = yield* Effect.tryPromise({
        try: () => fetch(request, timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : undefined),
        catch: (error) =>
          new HttpError({
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          }),
      });
      const raw = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) =>
          new HttpError({
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          }),
      });
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable) {
        return yield* new HttpError({
          message: `${response.status} ${response.statusText}`.trim(),
          status: response.status,
          retryable: true,
        });
      }
      let text = raw;
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // keep original body
      }
      const statusLine = `${response.status} ${response.statusText}`.trim();
      return {
        isError: !response.ok,
        text: truncateBody(`${statusLine}\n${text}`.trim(), maxResponseBytes),
      };
    });

    return yield* attempt.pipe(
      Effect.retry({
        times: retries,
        while: (error) => error instanceof HttpError && error.retryable === true,
        ...(retryDelayMs > 0 ? { schedule: Schedule.spaced(retryDelayMs) } : {}),
      }),
    );
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        isError: true as const,
        text: error instanceof Error ? error.message : String(error),
      }),
    ),
  );

export async function executeToolRequest(
  tool: OpenApiMcpTool,
  args: Record<string, unknown>,
  options: ExecuteRequestOptions,
): Promise<{ text: string; isError: boolean }> {
  return runApp(executeToolRequestEffect(tool, args, options), { fetch: options.fetch });
}

export { runApp };
