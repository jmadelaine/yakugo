# i18n PR editor

A web UI for writers to edit translations without touching git. Edits are made in a
table and saved into a draft change. When ready, the change is submitted for review,
which opens a GitHub pull request behind the scenes. Reviewers see a list of changed
translation keys (not a raw diff) and merge from the UI.

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

## Configuring the translations repo

Add `yakugo.yaml` at the root of the repo that holds the translations. It lists
projects; each project is one table in the editor.

```yaml
sourceLocale: en           # optional default; each project can set its own
files: "{locale}.json"     # optional default file pattern inside each project path

projects:
  # Plain per-locale JSON. A leaf string is the value; nested and flat keys both work.
  - name: Web app
    path: apps/web/locales
    sourceLocale: en       # reference locale, shown first in the editor
    placeholders:          # optional: how placeholders look, and example values
      pattern: "{placeholder}"   # `placeholder` stands for its name; "{{placeholder}}", "$placeholder$", …
      examples:
        count: 3
        userName: Yuki

  # One object per key. Fields are paths into that object. `description` is a shared
  # field: one column for all locales, stored in the source locale's file.
  - name: Browser extension
    path: extension/_locales
    files: "{locale}/messages.json"
    fields:
      value: message
      description: description

  # One CSV for every locale. Fields are column headers; the value column carries
  # {locale}, so `en`, `de`, … columns are picked up as locales.
  - name: Marketing site
    path: marketing
    files: strings.csv
    fields:
      key: Key
      value: "{locale}"
      description: Context

  # One CSV per locale. Shared fields live in the source locale's file.
  - name: Emails
    path: emails
    files: "{locale}.csv"
    fields:
      key: id
      value: text
      notes: notes

  # One JSON file for every locale, records in an array.
  - name: Catalog
    files: catalog.json
    records: entries          # path to the array or object holding the records
    fields:
      key: id
      value: "text.{locale}"
      note: comment
```

Rules:

- `path` is a sub directory of the repo; `files` is the pattern inside it. `format`
  is `json` or `csv` and defaults to the file extension.
- `{locale}` goes in `files` (one file per locale), in the `value` field path (one file
  holding all locales), or both (per-locale files whose value column is named after
  the locale, e.g. `key_name,en,comment` in `app-en.csv`).
- `key` and `value` are built-in fields. Every other entry under `fields` is a shared
  per-key text column (description, context, notes, …).
- JSON field paths are dotted paths inside a record; `.` means the record itself.
  CSV field paths are column headers.
- `placeholders.pattern` tells the editor how to spot placeholders in a string. Cells
  that use any show a preview with the `examples` filled in and a tag per placeholder.
  Writers can add, edit and remove example values from the editor ("Placeholders…" or
  by clicking a tag); those edits are committed to `yakugo.yaml` as part of the change
  and show up in its diff. The pattern itself is only edited in the file.
- Without a `yakugo.yaml`, the app uses one project at `LOCALES_DIR` with
  `<locale>.json` files.

## Setup

### Local development without GitHub

`example-repo/` stands in for the translations repo. Its `locales/` folder is the base
branch; proposed branches and PRs are kept in `example-repo/.state.json` (gitignored).
Sign-in needs no OAuth app and signs you in as your OS user (`LOCAL_USER` overrides).

1. `cp .env.example .env` and set `LOCAL_DATA_DIR=example-repo`.
2. `pnpm install`
3. `pnpm dev`

Reset the example: `git checkout example-repo/locales && rm -f example-repo/.state.json`.

### Against a real GitHub repo

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
   Set the callback URL to `<APP_URL>/auth/callback`
   (`http://localhost:5173/auth/callback` for local development).
2. `cp .env.example .env` and fill in the values.
3. `pnpm install`
4. `pnpm dev` starts the Vite dev server on :5173 and the API on :8787.

Scripts: `pnpm test` (vitest), `pnpm typecheck`, `pnpm lint`, `pnpm build` then `pnpm start` (API serves `dist/`).

## Repo layout

- `shared/` — types and translation logic (flatten, diff, serialize). Used by both sides.
- `server/` — Hono API: GitHub OAuth, encrypted session cookie, and a `Repository`
  with two implementations: GitHub (Octokit) and a local folder (development).
- `example-repo/` — stand-in target repo for local development.
- `src/` — Vite + React UI.

## Limits

- Only JSON files, one per locale, in a single directory.
- Empty cells mean "key absent in this locale" and are not written to the file.
- Non-string JSON leaves (numbers, arrays) are shown and saved as their JSON text in a string.
- The OAuth token needs the `repo` scope. Only users with write access to the repo can create or merge PRs.
