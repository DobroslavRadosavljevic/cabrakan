import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Version from the published `package.json` (works from `src/` and `dist/`). */
export function readPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return (require(join(dir, "..", "package.json")) as { version: string }).version;
}
