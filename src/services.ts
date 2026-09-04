import { Context, Effect, Layer, Ref } from "effect";
import type { FetchLike } from "./types.ts";

export type CachedToken = {
  token: string;
  expiresAt: number;
};

export class SpecHttp extends Context.Service<
  SpecHttp,
  {
    readonly fetch: FetchLike;
  }
>()("sobek/SpecHttp") {
  static layer = (fetchFn: FetchLike = globalThis.fetch) => Layer.succeed(this, { fetch: fetchFn });
}

export class ApiHttp extends Context.Service<
  ApiHttp,
  {
    readonly fetch: FetchLike;
  }
>()("sobek/ApiHttp") {
  static layer = (fetchFn: FetchLike = globalThis.fetch) => Layer.succeed(this, { fetch: fetchFn });
}

export class TokenCache extends Context.Service<
  TokenCache,
  {
    readonly get: (key: string) => Effect.Effect<CachedToken | undefined>;
    readonly set: (key: string, value: CachedToken) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
  }
>()("sobek/TokenCache", {
  make: Effect.gen(function* () {
    const ref = yield* Ref.make(new Map<string, CachedToken>());
    return {
      get: (key: string) => Ref.get(ref).pipe(Effect.map((map) => map.get(key))),
      set: (key: string, value: CachedToken) =>
        Ref.update(ref, (map) => {
          const next = new Map(map);
          next.set(key, value);
          return next;
        }),
      clear: Ref.update(ref, () => new Map<string, CachedToken>()),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

const sharedTokenCache = Effect.runSync(TokenCache.make);

/** Process-wide cache so OAuth tokens survive successive Promise-edge calls. */
export const TokenCacheLive = Layer.succeed(TokenCache, sharedTokenCache);
