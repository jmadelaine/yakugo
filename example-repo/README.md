# Example target repo

Stands in for the GitHub repository that holds translations when the app runs with
`LOCAL_DATA_DIR=example-repo`. `yakugo.yaml` declares one project per supported layout,
each with English (source) and Japanese. Some Japanese cells are missing on purpose.

| Project | Layout | Files |
| --- | --- | --- |
| Web app | Plain JSON, one file per locale, nested keys | `web/locales/<locale>.json` |
| Browser extension | Structured JSON, one file per locale, `message` + `description` | `extension/_locales/<locale>/messages.json` |
| Product catalog | Structured JSON, one file for all locales, records in an array | `catalog/strings.json` |
| Marketing site | CSV, one file for all locales, a column per locale | `marketing/strings.csv` |
| Transactional emails | CSV, one file per locale | `emails/<locale>.csv` |

Proposed branches and pull requests are kept in `.state.json`, which is gitignored.
Merging writes the result back into the project folders.

To reset: `git checkout example-repo && rm -f example-repo/.state.json`.
