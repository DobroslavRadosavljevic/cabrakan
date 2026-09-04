import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: "esm",
  dts: true,
  platform: "node",
  fixedExtension: true,
  exports: {
    legacy: true,
    customExports(map) {
      map["."] = {
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
        default: "./dist/index.mjs",
      };
      map["./cli"] = {
        types: "./dist/cli.d.mts",
        import: "./dist/cli.mjs",
        default: "./dist/cli.mjs",
      };
      return map;
    },
  },
});
