# AGENTS.md

## Stack

- TypeScript 7, ESM only, Bun 1.3 for install and scripts
- Published CLI runtime: Node `^22.18.0 || >=24.11.0` (Bun also runs `src/cli.ts`)
- MCP: `@modelcontextprotocol/server` 2.x
- Effect 4 (beta) for CLI and HTTP/auth effects
- Tests: Vitest 4 (`unit` and `integration` projects)
- Bundle: tsdown 0.22

## Commands

- Install: `bun install`
- Dev CLI: `bun src/cli.ts <spec>`
- Watch build: `bun run dev`
- Unit tests: `bun run test`
- One test file: `bunx vitest run --project unit tests/unit/cli.test.ts`
- Integration: `bun run test:integration` (needs network for live spec URLs)
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Pack check: `bun run check:pack`
- Pack (typecheck, unit tests, build): `bun run pack:dry`
- npm web login (2FA in the browser): `bun run login`
- Publish: `bun run release` (`bun publish --access public --auth-type=web`)

## Communication (ASD-STE100)

Hard rule for all agent text to humans. Also covers names in the codebase. Do not skip for tone, polish, or expertise.

**ASD-STE100 Simplified Technical English** is a controlled writing standard. Aerospace and defense groups made it. It helps people write clear technical text.

**Key rules:**

- **Use approved words only.** Treat simple common English as the word list. Each word has one meaning.
- **Use one word for one idea.** Do not use two words for the same thing.
- **Write short sentences.** Use 20 words or less for instructions. Use 25 words or less for other sentences.
- **Use active voice.** Write "Turn the switch", not "The switch must be turned".
- **Write short paragraphs.** Keep one topic in each paragraph.

**Also:**

- Prefer common verbs: `use`, `start`, `stop`, `show`, `set`, `get`, `fix`, `add`, `remove`.
- Keep exact API names, errors, paths, and code. Define a hard term in one short sentence the first time. Then reuse that term.
- Match the user’s word for a thing. Do not rename it in prose.
- Names must read like English intent. No riddles, meme names, or opaque abbreviation piles.
- Lead with the outcome or the next action. Put raw dumps last.
- Do not send a reply until the prose passes these checks.

**Goal:** The goal is easy reading. Many readers are not native English speakers. Clear text helps them do the work in a safe and correct way.

## Layout

- Source: `src/` (`cli.ts` is the bin, `index.ts` is the public library)
- Tests: `tests/unit`, `tests/integration`, `tests/fixtures`
- Generated: `dist/` — do not edit
- Public consumer skill: `skills/cabrakan/`
- Local vendored skills: `.agents/skills/` (not the public catalog)
- Cursor MCP smoke: `.cursor/mcp.json`

## Project rules

- Keep the package ESM-only. Do not add a CJS build unless a caller requires it.
- Do not add GitHub Actions. Release is local: `npm pack` / `npm publish`.
- npm package and CLI bin name is `cabrakan`. `--version` / `-V` prints `package.json` version. `--server-version` sets the MCP server version string.
- Logs go to stderr. stdout is the MCP protocol (except `--list-tools` and `--version`).
- Credentials come from flags and `OPENAPI_MCP_*` env vars. Do not log secrets.
- `README.md` is the human page. Keep its friendly tone and emojis. Do not rewrite it into STE.
- When you change spec load, tools, auth, or CLI flags, update `README.md` and `skills/cabrakan/references/`.
- GitHub remote: `DobroslavRadosavljevic/cabrakan`. Do not use the old `sobek` remote.

## Testing

- Fix failing tests and type errors before finishing.
- Add or update tests for behavior you change when the area already has coverage.
- Prefer `bunx vitest run --project unit <file>` while you iterate. Run `bun run test` before pack.

## Git and PRs

- No GitHub CI. Before pack or publish, run `bun run typecheck`, `bun run test`, and `bun run build`.
- Ask before force-push.

## Boundaries

- Always: keep `files` limited to `dist` plus changelog; do not pack `.agents/` or tests
- Ask first: rename the npm package `cabrakan`; change `package.json` `name` / `files` / `exports`; add production dependencies
- Never: commit secrets; edit `dist/`; add GitHub workflows for publish; treat `.agents/skills/*` third-party skills as this package’s public skill

## Docs index

| Topic | Document |
| --- | --- |
| Human setup | `README.md` |
| Consumer skill | `skills/cabrakan/SKILL.md` |
| Spec contract | `skills/cabrakan/references/openapi-spec.md` |
| Release notes | `CHANGELOG.md` |
| License | `LICENSE` |

## Security notes

- This process calls the real HTTP API with the credentials you pass. Treat the MCP host as trusted.
- HTTP transport binds to `127.0.0.1` by default. Do not bind `0.0.0.0` unless you mean to.
