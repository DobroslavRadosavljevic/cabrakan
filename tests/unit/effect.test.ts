import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SpecError } from "../../src/errors.ts";
import { resolveBaseUrlEffect } from "../../src/http.ts";
import { parseOpenApiTextEffect } from "../../src/load-spec.ts";

describe("Effect domain", () => {
  it.effect("fails tagged SpecError on empty documents", () =>
    Effect.gen(function* () {
      const error = yield* parseOpenApiTextEffect("   ", "mem").pipe(Effect.flip);
      expect(error).toBeInstanceOf(SpecError);
      expect(error._tag).toBe("SpecError");
      expect(error.message).toMatch(/Empty OpenAPI document/);
    }),
  );

  it.effect("fails tagged RequestBuildError without a base URL", () =>
    Effect.gen(function* () {
      const error = yield* resolveBaseUrlEffect(undefined, []).pipe(Effect.flip);
      expect(error._tag).toBe("RequestBuildError");
      expect(error.message).toMatch(/base URL/i);
    }),
  );
});
