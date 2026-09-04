import { Effect } from "effect";
import { AuthError } from "./errors.ts";
import { runApp, runAppSync } from "./runtime.ts";
import { ApiHttp, TokenCache } from "./services.ts";
import type {
  AuthOptions,
  FetchLike,
  OpenApiMcpTool,
  SchemeCredential,
  SecurityRequirement,
  SecurityScheme,
} from "./types.ts";

export type AppliedAuth = {
  headers: Record<string, string>;
  query: Array<{ name: string; value: string }>;
  cookies: string[];
};

// btoa throws on code points above U+00FF, so encode via UTF-8 bytes first.
const base64Utf8 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

function parseBasic(
  basic: AuthOptions["basic"],
): Effect.Effect<{ username: string; password: string } | undefined, AuthError> {
  return Effect.gen(function* () {
    if (!basic) {
      return undefined;
    }
    if (typeof basic === "string") {
      const index = basic.indexOf(":");
      if (index === -1) {
        return yield* new AuthError({ message: 'Basic auth must be "username:password"' });
      }
      return { username: basic.slice(0, index), password: basic.slice(index + 1) };
    }
    return basic;
  });
}

function credentialFor(
  schemeName: string,
  scheme: SecurityScheme,
  auth: AuthOptions | undefined,
): Effect.Effect<SchemeCredential | undefined, AuthError> {
  return Effect.gen(function* () {
    const named = auth?.schemes?.[schemeName];
    if (named) {
      return named;
    }
    if (scheme.type === "apiKey" && auth?.apiKey) {
      return { value: auth.apiKey };
    }
    if (scheme.type === "http" && scheme.scheme.toLowerCase() === "bearer" && auth?.bearer) {
      return { token: auth.bearer };
    }
    if (scheme.type === "http" && scheme.scheme.toLowerCase() === "basic" && auth?.basic) {
      return yield* parseBasic(auth.basic);
    }
    if ((scheme.type === "oauth2" || scheme.type === "openIdConnect") && auth?.bearer) {
      return { token: auth.bearer };
    }
    return undefined;
  });
}

function pickRequirement(
  security: SecurityRequirement[] | undefined,
  schemes: Record<string, SecurityScheme> | undefined,
  auth: AuthOptions | undefined,
): Effect.Effect<SecurityRequirement | undefined, AuthError> {
  return Effect.gen(function* () {
    if (security === undefined) {
      return undefined;
    }
    if (security.length === 0) {
      return {};
    }
    for (const requirement of security) {
      const names = Object.keys(requirement);
      if (names.length === 0) {
        return requirement;
      }
      let ok = true;
      for (const name of names) {
        const scheme = schemes?.[name];
        const credential = scheme ? yield* credentialFor(name, scheme, auth) : undefined;
        if (!scheme || !credential) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return requirement;
      }
    }
    return security[0];
  });
}

const clientCredentialsToken = (
  schemeName: string,
  scheme: SecurityScheme,
  credential: SchemeCredential,
): Effect.Effect<string, AuthError, ApiHttp | TokenCache> =>
  Effect.gen(function* () {
    if (credential.token) {
      return credential.token;
    }
    if (scheme.type !== "oauth2") {
      return yield* new AuthError({
        message: `Scheme ${schemeName} cannot fetch a client-credentials token`,
      });
    }
    const tokenUrl = credential.tokenUrl ?? scheme.flows.clientCredentials?.tokenUrl;
    if (!tokenUrl || !credential.clientId || !credential.clientSecret) {
      return yield* new AuthError({
        message: `OAuth2 scheme "${schemeName}" needs a token, or clientId + clientSecret + tokenUrl (spec or override)`,
      });
    }
    const cache = yield* TokenCache;
    const cacheKey = `${tokenUrl}:${credential.clientId}`;
    const cached = yield* cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5_000) {
      return cached.token;
    }
    const { fetch } = yield* ApiHttp;
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: credential.clientId!,
            client_secret: credential.clientSecret!,
          }),
        }),
      catch: (error) =>
        new AuthError({
          message: `OAuth2 token request failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
    const raw = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) =>
        new AuthError({
          message: `OAuth2 token response could not be read: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
    if (!response.ok) {
      return yield* new AuthError({ message: `OAuth2 token request failed: ${response.status} ${raw}` });
    }
    const json = yield* Effect.try({
      try: () => JSON.parse(raw) as { access_token?: string; expires_in?: number },
      catch: () => new AuthError({ message: "OAuth2 token response was not JSON" }),
    });
    if (!json.access_token) {
      return yield* new AuthError({ message: "OAuth2 token response missing access_token" });
    }
    yield* cache.set(cacheKey, {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    });
    return json.access_token;
  });

export const applyAuthEffect = (options: {
  tool: OpenApiMcpTool;
  documentSchemes: Record<string, SecurityScheme> | undefined;
  documentSecurity: SecurityRequirement[] | undefined;
  auth?: AuthOptions;
}): Effect.Effect<AppliedAuth, AuthError, ApiHttp | TokenCache> =>
  Effect.gen(function* () {
    const applied: AppliedAuth = { headers: {}, query: [], cookies: [] };
    const security = options.tool.security ?? options.documentSecurity;
    const schemes = options.documentSchemes ?? {};
    const requirement = yield* pickRequirement(security, schemes, options.auth);

    if (requirement === undefined) {
      if (options.auth?.bearer) {
        applied.headers.Authorization = `Bearer ${options.auth.bearer}`;
      }
      const basic = yield* parseBasic(options.auth?.basic);
      if (basic) {
        applied.headers.Authorization = `Basic ${base64Utf8(`${basic.username}:${basic.password}`)}`;
      }
      return applied;
    }

    for (const [schemeName, scopes] of Object.entries(requirement)) {
      const scheme = schemes[schemeName];
      if (!scheme) {
        return yield* new AuthError({ message: `Unknown security scheme "${schemeName}"` });
      }
      if (scheme.type === "mutualTLS") {
        return yield* new AuthError({
          message: `mutualTLS scheme "${schemeName}" is not supported by this HTTP client`,
        });
      }
      const credential = yield* credentialFor(schemeName, scheme, options.auth);
      if (!credential) {
        return yield* new AuthError({
          message: `Missing credentials for required security scheme "${schemeName}"`,
        });
      }

      if (scheme.type === "apiKey") {
        const value = credential.value ?? credential.token;
        if (!value) {
          return yield* new AuthError({ message: `apiKey scheme "${schemeName}" needs a value` });
        }
        if (scheme.in === "header") {
          applied.headers[scheme.name] = value;
        } else if (scheme.in === "query") {
          applied.query.push({ name: scheme.name, value });
        } else {
          applied.cookies.push(`${scheme.name}=${value}`);
        }
      } else if (scheme.type === "http") {
        const httpScheme = scheme.scheme.toLowerCase();
        if (httpScheme === "bearer") {
          const token = credential.token ?? credential.value;
          if (!token) {
            return yield* new AuthError({ message: `http bearer scheme "${schemeName}" needs a token` });
          }
          applied.headers.Authorization = `Bearer ${token}`;
        } else if (httpScheme === "basic") {
          if (!credential.username || credential.password === undefined) {
            return yield* new AuthError({
              message: `http basic scheme "${schemeName}" needs username and password`,
            });
          }
          applied.headers.Authorization = `Basic ${base64Utf8(`${credential.username}:${credential.password}`)}`;
        } else {
          const token = credential.token ?? credential.value;
          if (!token) {
            return yield* new AuthError({
              message: `http ${httpScheme} scheme "${schemeName}" needs a token/value`,
            });
          }
          applied.headers.Authorization = `${scheme.scheme} ${token}`;
        }
      } else if (scheme.type === "oauth2") {
        const token = yield* clientCredentialsToken(schemeName, scheme, credential);
        applied.headers.Authorization = `Bearer ${token}`;
        void scopes;
      } else if (scheme.type === "openIdConnect") {
        const token = credential.token ?? credential.value;
        if (!token) {
          return yield* new AuthError({
            message: `openIdConnect scheme "${schemeName}" needs a bearer token (interactive OIDC is not supported)`,
          });
        }
        applied.headers.Authorization = `Bearer ${token}`;
      }
    }

    return applied;
  });

export function clearTokenCache(): void {
  runAppSync(Effect.gen(function* () {
    const cache = yield* TokenCache;
    yield* cache.clear;
  }));
}

export async function applyAuth(options: {
  tool: OpenApiMcpTool;
  documentSchemes: Record<string, SecurityScheme> | undefined;
  documentSecurity: SecurityRequirement[] | undefined;
  auth?: AuthOptions;
  fetch: FetchLike;
}): Promise<AppliedAuth> {
  return runApp(applyAuthEffect(options), { fetch: options.fetch });
}
