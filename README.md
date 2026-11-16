# [MU/TH/UR](https://mu-th-ur.vercel.app/demo.html)

A local-first project handoff CLI and private Vercel dashboard for developers and coding assistants. Each repository keeps its own Markdown state and activity log; `muthur publish` sends a snapshot to a private Vercel Blob store so you can view an overview across projects.

**Public demo:** [mu-th-ur.vercel.app/demo.html](https://mu-th-ur.vercel.app/demo.html) (fictional sample data; no private project information) · **Source:** [GitHub](https://github.com/charlfourie/MU-TH-UR)

The owner-only dashboard requires GitHub sign-in. Its URL is intentionally not linked from public pages. MU/TH/UR tracks its own development in `.muthur/`, alongside the projects it coordinates. Escapement is the first external project connected; its handoff is stored in [`escapement/.muthur/`](https://github.com/charlfourie/escapement/tree/main/.muthur) and its latest published status appears in the private dashboard.

The public demo is a separate, static page with fictional projects and activity. It makes no API requests and does not read or expose private dashboard data.

## Stack

- TypeScript for the CLI and state model.
- Node.js 20+ and a small TypeScript build toolchain.
- Markdown with a small YAML front matter schema for state; plain Markdown for activity.
- Node built-ins for filesystem access, Git root detection, and repository scanning.
- Vite for the dashboard; Vercel Functions and private Vercel Blob for the hosted overview.
- GitHub OAuth restricted to one configured account; the CLI uses a separate publish token.

## Getting started

```powershell
npm install
npm run build
npm link

cd C:\path\to\your\repository
muthur init --actor human --summary "Starting project handoff"
muthur update --actor copilot --status active --summary "Implementing the import flow" --next "Add tests"
muthur log --actor claude --message "Reviewed the parser; suggested preserving unknown fields"
muthur overview C:\path\to\your\repositories
muthur publish
```

`init`, `update`, and `log` use the Git repository root when run inside a Git worktree. Otherwise, they use the current directory. `overview` searches supplied directories recursively (up to five levels by default), skipping dependency and build-output directories. Pass `--depth N` to change the scan depth.

Every write requires `--actor copilot`, `--actor claude`, or `--actor human`. Attribution records the declared actor; it does not attempt to verify which program or person invoked the command.

## Private Vercel dashboard

The local `.muthur/` files remain the source of truth. Publishing is explicit: after changing a project's state or activity, run `muthur publish` to update its private dashboard snapshot. Set these environment variables on the Vercel project:

| Variable | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` | Client ID for a GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | Client secret for that OAuth App |
| `OWNER_GITHUB` | The one GitHub login allowed to view the dashboard |
| `SESSION_SECRET` | Random session-signing secret, at least 32 characters |
| `MUTHUR_PUBLISH_TOKEN` | Random secret used by the CLI to publish snapshots |
| `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN` | `BLOB_STORE_ID` is added when a Vercel Blob store is connected; the Blob SDK uses Vercel OIDC in hosted functions |

Generate secrets locally (run separately for the session secret and publish token):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

### Deploy setup

1. Push this project to a GitHub repository and import it into Vercel. The included `vercel.json` builds the Vite dashboard and configures the static output directory.
2. In Vercel Storage, create and connect a Blob store. Vercel adds `BLOB_STORE_ID`; the Blob SDK authenticates from Vercel OIDC in hosted functions. If using a manually configured token instead, keep `BLOB_READ_WRITE_TOKEN` private.
3. Create a GitHub OAuth App. Set its callback URL to `https://YOUR-VERCEL-DOMAIN/api/auth/callback`. The dashboard needs only the GitHub identity; it requests no repository scopes.
4. Add the environment variables above to the Vercel project and redeploy. The dashboard allows only the exact account in `OWNER_GITHUB`.
5. On each machine, set `MUTHUR_URL` to the private dashboard's deployed origin and provide `MUTHUR_PUBLISH_TOKEN` from a secret manager or protected shell environment. It must match the token configured on Vercel. Then run `muthur publish` from an initialized repository.

For a one-off publish, the URL can instead be passed with `muthur publish --url https://YOUR-VERCEL-DOMAIN`. The token is read only from `MUTHUR_PUBLISH_TOKEN` rather than a command-line argument, so it is less likely to end up in shell history or process listings. Use a secret manager or protected environment when available; do not commit secrets or put them in `.muthur/`.

The dashboard lists the latest snapshot per repository, its current status, summary, next steps, and recent activity. Repository identity is a SHA-256 hash of the Git `origin` URL, so separate clones of the same remote update one dashboard entry. If a repository has no origin, its local path is hashed instead and publishes from other machines will appear as separate projects. Repository URLs are stored only in the private snapshot; embedded URL credentials are removed before publishing.

## Repository file structure

```text
.muthur/
  state.md       # Current project state; safe to edit by hand
  activity.md    # Append-only, timestamped activity entries
```

### `state.md` schema

The YAML front matter is the stable, machine-readable part. String values are JSON-quoted (valid YAML); the rest is Markdown for people and assistants.

```yaml
---
schema: 1
project: "Example project"
status: "active"
updated_at: "2026-11-16T08:00:00.000Z"
updated_by: "human"
summary: "What is happening now."
next_steps:
  - "Finish the CLI"
  - "Ask Claude to review the design"
---

# Example project

**Status:** active

## Current state

What is happening now.

## Next steps

- Finish the CLI
- Ask Claude to review the design
```

Statuses are `active`, `paused`, `blocked`, and `complete`. Actors are `copilot`, `claude`, and `human`. The CLI maintains both the front matter and its Markdown rendering when updating state; if editing by hand, update both so the file stays clear in plain-text previews.

### `activity.md` format

Each event is appended under a timestamp and actor heading:

```md
## 2026-11-16T08:00:00.000Z — copilot

- Implemented the parser and added tests.
```

The log is append-only through the CLI; state can be updated repeatedly without losing prior activity.

## CLI commands

- `muthur init --actor <actor> [--name <name>] [--summary <text>]`
- `muthur update --actor <actor> [--status <status>] [--summary <text>] [--next <step> ...] [--clear-next]`
- `muthur log --actor <actor> --message <text>`
- `muthur overview [directory ...] [--depth <n>]`
- `muthur publish [--url <dashboard-url>]`

The `overview` output is a Markdown table suitable for terminals, issue comments, or pasting into an AI session. A project can be given multiple next steps; `--clear-next` removes existing steps before adding any supplied with `--next`. `publish` sends the current state and activity log to the configured private dashboard.

## MVP boundaries

- No automatic sync: publishing is explicit and local commands still work offline.
- No centralized database or AI provider integration.
- No modification of a repository's Git files; `.muthur/` is ordinary project content and can be committed with the repo.
- The hosted dashboard is single-owner, not a multi-user collaboration service.
- Actor attribution is self-declared. Git author identity and assistant-session detection are out of scope.
- Each published activity log is limited to 200 KB and each complete publish request to 250 KB.

## Development

```powershell
npm test
npm run typecheck
```

`npx vite --host 127.0.0.1` serves the local dashboard shell. The authenticated API routes require Vercel Functions and a connected private Blob store; use a Vercel preview deployment to test sign-in and publishing end to end.
