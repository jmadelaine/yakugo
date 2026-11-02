# i18n PR editor — agent guide

## What this is

A web tool that lets writers edit translations and ship them as GitHub pull requests
without using git. Writers sign in with GitHub, edit a keys × locales table, propose
changes as a PR, review a translation-level diff (added / removed / changed keys per
locale), and merge from the UI.

Translations live in a separate GitHub repo (`GITHUB_REPO`), one JSON file per locale
in `LOCALES_DIR` (e.g. `locales/en.json`, `locales/de.json`). This app never clones
that repo; every read and write goes through the GitHub REST API with the signed-in
user's OAuth token.

## Stack

- Frontend: Vite, React 19, TypeScript, react-router. Plain CSS in `src/index.css`.
- Backend: Hono on Node (`@hono/node-server`), Octokit. Run with `tsx`.
- Tests: vitest. Lint: oxlint.
- Package manager: pnpm.

## Layout

```
shared/     types + pure translation logic, imported by both server and src
  types.ts            API shapes (TranslationSnapshot, TranslationChange, PullRequestDetail, …)
  translations.ts     flatten / unflatten / parse / serialize / diffTranslations / groupChangesByKey / slugify
server/     Hono API
  index.ts            app wiring, error handler, serves dist/ in production
  env.ts              reads and validates env vars (see .env.example)
  session.ts          AES-256-GCM encrypted httpOnly cookie holding the GitHub token
  auth.ts             /auth/login, /auth/callback (GitHub OAuth), /auth/logout
  api.ts              /api routes (all except /me and /config require a session)
  github.ts           Octokit helpers: read locale files, commit via Git Data API, PRs
src/        React app
  App.tsx             routes + header
  lib/api.ts          typed fetch client for /api
  lib/auth.tsx        AuthGate (sign-in screen until /api/me succeeds)
  lib/useAsync.ts     load-on-mount hook with reload
  lib/useTranslationEditor.ts   editor state (keys, values, changes, payload)
  pages/HomePage.tsx          open translation PRs
  pages/EditorPage.tsx        /edit (base branch) and /pr/:number/edit (PR branch)
  pages/PullRequestPage.tsx   diff, merge, close
  components/ChangeList.tsx   translation diff view
  components/TranslationTable.tsx
```

`@shared/*` resolves to `shared/` (alias in `vite.config.ts` and `tsconfig.app.json`).
Server code imports it with relative paths.

## Key behaviors

- **Snapshot**: `GET /api/translations?branch=` returns all locale files flattened to
  dot-keys plus the branch `headSha`.
- **Writes** send `expectedHeadSha`. The server rejects with 409 if the branch moved.
  Only files whose serialized content differs are written, in one commit via the Git
  Data API (blob tree → commit → update ref).
- **Propose** (`POST /api/propose`) creates branch `i18n/<user>/<slug>-<ts>` from the
  base head, commits, opens a PR. PRs are listed by the `i18n/` branch prefix.
- **PR diff** (`GET /api/pulls/:n`) compares the merge base with the PR head and
  returns `TranslationChange[]`. Types: `added`, `removed`, `changed` (with
  `before`/`after`). Non-translation files are returned in `otherFiles`.
- **Merge** uses squash and deletes the branch. **Close** leaves the branch.
- **Nested vs flat JSON** is detected per file and preserved on write.
- **Empty cell = key absent** in that locale; empty strings are not written.
- Non-string JSON leaves are shown and saved as their JSON text inside a string.

## Conventions

- Enum-like values use a `const` object + derived type (see `CHANGE_TYPE`).
- Rendered JSX text is wrapped in braces: `{'Text'}`.
- Prefer `undefined` over `null` for absent values.
- Keep translation logic pure and in `shared/` with tests. Server and UI should only
  call it.
- Comments explain non-obvious why; do not narrate the code.

## Commands

```
pnpm dev        # vite :5173 + API :8787 (vite proxies /api and /auth)
pnpm test       # vitest
pnpm typecheck  # tsc -b (app, server, node configs)
pnpm lint       # oxlint
pnpm build && pnpm start   # production: API serves dist/
```

Run `pnpm typecheck` and `pnpm lint` after changes. Run tests before committing.

## Setup for a real run

Needs a GitHub OAuth App with callback `<APP_URL>/auth/callback` and a `.env` based on
`.env.example`. The token scope is `repo read:user`.
