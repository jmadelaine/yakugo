# i18n PR editor

A web UI for writers to edit translations without touching git. Edits are made in a
table, proposed as GitHub pull requests, reviewed as a list of changed translation
keys (not a raw diff), and merged from the UI.

## How it works

- Writers sign in with their own GitHub account (OAuth). All git operations run
  with their token, so PRs and commits are attributed to them.
- The editor loads every `<locale>.json` file from `LOCALES_DIR` on the base
  branch and shows keys × locales in one table. Nested JSON is flattened to
  dot-keys and written back in the same shape.
- "Propose changes" creates a branch (`i18n/<user>/<slug>`), one commit with the
  changed files, and a pull request.
- The PR page shows a translation diff grouped by key: `added`, `removed` and
  `changed` (old → new) per locale. Non-translation files in the PR are listed
  separately. Merge (squash) and Close run from the UI.
- An open PR can be edited again from the UI; new edits are committed to its branch.
- Concurrent edits are detected: a write fails if the branch moved since it was loaded.

## Setup

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
   Set the callback URL to `<APP_URL>/auth/callback`
   (`http://localhost:5173/auth/callback` for local development).
2. `cp .env.example .env` and fill in the values.
3. `pnpm install`
4. `pnpm dev` starts the Vite dev server on :5173 and the API on :8787.

Scripts: `pnpm test` (vitest), `pnpm typecheck`, `pnpm lint`, `pnpm build` then `pnpm start` (API serves `dist/`).

## Repo layout

- `shared/` — types and translation logic (flatten, diff, serialize). Used by both sides.
- `server/` — Hono API: GitHub OAuth, encrypted session cookie, Octokit calls.
- `src/` — Vite + React UI.

## Limits

- Only JSON files, one per locale, in a single directory.
- Empty cells mean "key absent in this locale" and are not written to the file.
- Non-string JSON leaves (numbers, arrays) are shown and saved as their JSON text in a string.
- The OAuth token needs the `repo` scope. Only users with write access to the repo can create or merge PRs.
