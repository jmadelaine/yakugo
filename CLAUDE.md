# i18n PR editor — agent guide

## What this is

A web tool that lets writers edit translations and ship them as GitHub pull requests
without using git. Writers sign in with GitHub, edit a keys × locales table, save the
edits as a draft branch, propose the draft as a PR, review a translation-level diff
(added / removed / changed keys per locale), and merge from the UI.

Translations live in a separate GitHub repo (`GITHUB_REPO`). A `yakugo.yaml` at its root
lists projects; each has a `name`, a `path` (sub dir), a `files` pattern, a format (json
or csv, from the extension) and `fields`: paths into one record for `$key`, `$value` and
any shared per-key fields such as `description`. `{locale}` sits either in `files` (one
file per locale) or in the `$value` path (one file for all locales). Without the file,
one project at `LOCALES_DIR` with `<locale>.json` is assumed. See README for the schema.
This app never clones that repo; every read and write goes through the GitHub REST API
with the signed-in user's OAuth token.

For development, `pnpm dev` sets `LOCAL_DATA_DIR=example-repo`, which swaps GitHub for a
folder on disk that stands in for the target repo (`example-repo/`). Sign-in then needs
no OAuth app. `pnpm dev:github` reads `.env` and uses the real GitHub repo instead.

## Stack

- Frontend: Vite, React 19, TypeScript, react-router. Plain CSS in `src/index.css`.
- Backend: Hono on Node (`@hono/node-server`), Octokit. Run with `tsx`.
- Tests: vitest. Lint: oxlint.
- Package manager: pnpm.

## Layout

```
shared/     types + pure translation logic, imported by both server and src
  types.ts            API shapes (TranslationSnapshot, TranslationChange, PullRequestDetail, …)
  config.ts           yakugo.yaml parsing, project file patterns
  placeholders.ts     per-project placeholder pattern: find names in a string, fill examples
  configEdit.ts       rewrites placeholders.examples inside yakugo.yaml text, keeping comments
  translations.ts     flatten / unflatten / diffProject / mergeProject / groupChangesByKey / slugify
  format.ts           decodeProject / encodeProject: files ⇄ ProjectContent for json and csv
  csv.ts              RFC 4180 parse / serialize
server/     Hono API
  index.ts            app wiring, error handler, serves dist/ in production
  env.ts              reads and validates env vars (see .env.example)
  session.ts          AES-256-GCM encrypted httpOnly cookie holding the GitHub token
  auth.ts             /auth/login, /auth/callback (GitHub OAuth), /auth/logout
  api.ts              /api routes (all except /me and /config require a session)
  repository.ts       Repository interface the API talks to; picks GitHub or local
  github.ts           Repository over the GitHub REST API (Git Data API commits, PRs)
  local.ts            Repository over a folder on disk (dev only, see example-repo/)
src/        React app
  App.tsx             routes + header
  lib/api.ts          typed fetch client for /api
  lib/auth.tsx        AuthGate (sign-in screen until /api/me succeeds)
  lib/useAsync.ts     load-on-mount hook with reload
  lib/useTranslationEditor.ts   editor state (keys, values, changes, payload)
  pages/HomePage.tsx          projects + changes (drafts and PRs)
  pages/ProjectPage.tsx       /project/:id read-only table of the base branch; "Create change" lands in its editor
  pages/EditorPage.tsx        /change/:branch/edit/:project, one project on a change's branch
  pages/ChangePage.tsx        /change/:branch diff; propose, merge, close, delete draft
  components/ChangeList.tsx   translation diff view
  components/TranslationTable.tsx
example-repo/   stand-in for the target translations repo in local mode
  yakugo.yaml         one project per supported layout (see example-repo/README.md), en + ja
  web/, extension/, catalog/, marketing/, emails/   base branch files (committed)
  .state.json         proposed branches + PRs (runtime state, gitignored)
```

`@shared/*` resolves to `shared/` (alias in `vite.config.ts` and `tsconfig.app.json`).
Server code imports it with relative paths.

## Key behaviors

- **Projects**: `GET /api/projects` lists the projects from `yakugo.yaml`. Every
  read/write names a project id (slug of its name).
- **Snapshot**: `GET /api/translations?project=&branch=` returns `ProjectData`: locales,
  custom field names, `values[locale][key]`, `fieldValues[field][key]`, plus `headSha`.
- **Writes** send `expectedHeadSha` plus full `values` and `fieldValues`, and optionally
  `placeholderExamples` (the full example map; the server then rewrites `yakugo.yaml`
  in the same commit). The server rejects with 409 if the branch moved. `encodeProject` edits the existing files in
  place (unknown properties and columns survive) and returns only files whose text
  changes; those go in one commit via the Git Data API (blob tree → commit → update ref).
- **Two-stage flow.** Stage one, **create** (`POST /api/branches`) makes branch
  `i18n/<user>/<slug>-<ts>` from the base head; saves go to
  `POST /api/branches/:branch/commit`. Stage two, **propose**
  (`POST /api/branches/:branch/propose`) opens the PR. A branch without a PR is a draft.
- **Change details** (name, description) live in `.yakugo/change.yaml` on a draft branch
  (`shared/changeMeta.ts`); `PATCH /api/branches/:branch` edits them. Proposing removes
  the file and the PR title/body take over, so it never reaches the base branch.
- **Changes list** (`GET /api/branches`) is every branch with the `i18n/` prefix joined
  with its open PR. **Detail** (`GET /api/branches/:branch`) compares the merge base
  with the branch head and returns `TranslationChange[]` per project plus
  `placeholderExamples` diffs from the two configs. `yakugo.yaml` never counts as an
  "other file". Branch names are
  URL-encoded as one path segment. `DELETE /api/branches/:branch` removes a draft. Types: `added`, `removed`, `changed` (with
  `before`/`after`). Non-translation files are returned in `otherFiles`.
- **Merge** uses squash and deletes the branch. **Withdraw** (`POST /api/pulls/:n/close`)
  closes the PR and writes its title/body back to `.yakugo/change.yaml`, so the branch
  is a draft again; a closed, unmerged PR never defines a branch's state.
- **Local mode** keeps PR branches as file snapshots in `example-repo/.state.json`.
  Merge is a key-level three-way merge (`mergeTranslations`); conflicting keys give 409.
- **Nested vs flat JSON** is detected per file and preserved on write; new files nest.
- **Shared fields** (anything in `fields` besides `$key`/`$value`) are one column for all
  locales. With one file per locale they are read from and written to the source locale.
- **Empty cell = absent**; empty strings are not written.
- Non-string JSON leaves are shown as their JSON text; an unchanged one is left as is.

## Conventions

- Enum-like values use a `const` object + derived type (see `CHANGE_TYPE`).
- Rendered JSX text is wrapped in braces: `{'Text'}`.
- Prefer `undefined` over `null` for absent values.
- Keep translation logic pure and in `shared/` with tests. Server and UI should only
  call it.
- Comments explain non-obvious why; do not narrate the code.

## Commands

```
pnpm dev        # vite :5173 + API :8787 against example-repo (vite proxies /api and /auth)
pnpm dev:github # same, against the GitHub repo in .env
pnpm test       # vitest
pnpm typecheck  # tsc -b (app, server, node configs)
pnpm lint       # oxlint
pnpm build && pnpm start   # production: API serves dist/
```

Run `pnpm typecheck` and `pnpm lint` after changes. Run tests before committing.

## Setup for a real run

Needs a GitHub OAuth App with callback `<APP_URL>/auth/callback` and a `.env` based on
`.env.example`. The token scope is `repo read:user`.
