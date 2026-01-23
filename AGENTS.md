# Repository Guidelines

## Project Structure & Module Organization
- `apps/web/app`: Next.js App Router pages, API routes under `app/api/entries`.
- `apps/web/lib`: shared server/client helpers (MongoDB client, OpenRouter client, prompts, reflection store).
- `apps/web/public`: static assets.
- `apps/web/reflections`: JSON snapshots per entry (`<entryId>.json`) for audit/backups.
- `apps/web/scripts` and `apps/web/eval`: evaluation tooling for reflection quality.

## Build, Test, and Development Commands
Run from `apps/web`:
- `npm run dev`: start the local dev server at `http://localhost:3000`.
- `npm run build`: production build.
- `npm run start`: serve the production build.
- `npm run lint`: run ESLint.
- `npm run eval:calibrate`, `npm run eval:nightly`, `npm run eval:pr`, `npm run eval:gate`: run evaluation scripts for agent outputs.

## Coding Style & Naming Conventions
- TypeScript + React (Next.js App Router). Indentation is 2 spaces, semicolons are used, and double quotes are standard.
- Keep UI components in `apps/web/app` and reusable logic in `apps/web/lib`.
- Filenames are `kebab-case` for folders and `camelCase`/`PascalCase` for TS/TSX as needed; follow existing conventions in the same folder.
- Linting: ESLint via `npm run lint` (Next.js config).

## Testing Guidelines
- There is no formal unit test suite yet. Use the eval scripts in `apps/web/scripts` and `apps/web/eval` as the quality gate for reflection behavior.
- If you add tests later, document the runner and naming convention here.

## Commit & Pull Request Guidelines
- Commit messages are short, imperative, and sentence case (e.g., “Sanitize violations in eval library”). Avoid prefixes unless the repo adopts them.
- PRs should include a concise summary, testing notes (commands run), and screenshots for UI changes. Link related issues if available.

## Security & Configuration Tips
- Local config lives in `apps/web/.env.local` (MongoDB and OpenRouter settings). Do not commit secrets.
- Reflection snapshots contain user content; treat `apps/web/reflections` as sensitive local data.

## Agent-Specific Notes
- If you change agent prompts or output formats, update `apps/web/lib/prompts.ts` and verify eval scripts still pass.
- Reflection output is read-only by design; avoid adding conversational UI unless the product direction changes.
