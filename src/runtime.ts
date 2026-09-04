import { Effect, Layer } from "effect";
import { ApiHttp, SpecHttp, TokenCache, TokenCacheLive } from "./services.ts";
import type { FetchLike } from "./types.ts";

export type AppServices = ApiHttp | SpecHttp | TokenCache;

export function appLayer(options: { fetch?: FetchLike; specFetch?: FetchLike } = {}) {
  return Layer.mergeAll(
    ApiHttp.layer(options.fetch),
    SpecHttp.layer(options.specFetch ?? options.fetch),
    TokenCacheLive,
  );
}

export function runApp<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  options: { fetch?: FetchLike; specFetch?: FetchLike } = {},
): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(appLayer(options))));
}

export function runAppSync<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  options: { fetch?: FetchLike; specFetch?: FetchLike } = {},
): A {
  return Effect.runSync(effect.pipe(Effect.provide(appLayer(options))));
}
