# Plan: Format/Lint from UI + Submodule Sync Reminder

## Scope

1. **Per-project Format and Lint** – Add "Format" and "Lint" actions with streaming output (same pattern as test/build).
2. **Bulk actions** – Add "Format all", "Lint all", "Test all", "Build all" from the dashboard with streaming output.
3. **Submodule sync reminder** – Detect when submodule HEADs differ from DevKit’s recorded refs; show a banner with one-click "Sync to DevKit".

## Backend

### 1. Project handler (format/lint)

- **HandleProjectAction**: In the switch, add cases for `format` and `lint` that return immediately with success (like test/build); no blocking run.
- **handleProjectOperationStream**: In the command switch, add `format` → `make format` (or `make fmt` if that’s what the project uses), `lint` → `make lint`. Use same SSE streaming as test/build. Allow only `test`, `build`, `format`, `lint` in the stream handler.

Files: [dashboard/internal/handler/projects.go](dashboard/internal/handler/projects.go)

### 2. Router

- Add POST routes for per-project format and lint: `/{name}/format`, `/{name}/lint` (both call HandleProjectAction).
- Existing `GET /{name}/{action}/stream` already allows any action; ensure the stream handler accepts `format` and `lint`.

File: [dashboard/cmd/server/router.go](dashboard/cmd/server/router.go)

### 3. Bulk operations

- New handler: **HandleBulkStream(w, r)**. Query param or path: `?action=format` or `action=lint|test|build`. Stream output: for each project (from service.GetProjects), run the same command as per-project (make format / make lint / make test / make build) in `devkitRoot/projects/<name>`, prefix each line with `[project-name] `, stream via SSE. Same SSE headers and flusher pattern as HandleProjectStream.
- Route: `GET /api/projects/bulk/{action}/stream` (e.g. format, lint, test, build).

Files: new logic in [dashboard/internal/handler/projects.go](dashboard/internal/handler/projects.go), route in [dashboard/cmd/server/router.go](dashboard/cmd/server/router.go).

### 4. Submodule sync

- **Sync status**: Add function in git package, e.g. `SubmoduleSyncStatus(devkitRoot string, projectNames []string) (needsSync []string, err error)`. For each project, path = `projects/<name>`. Submodule HEAD = `git rev-parse HEAD` in project dir. DevKit ref = from devkit root `git ls-tree HEAD projects/<name>` and take the object (commit). If they differ, add project to needsSync.
- **Sync execution**: Run `git add projects/<name>` for each project in needsSync, then `git commit -m "Update submodules: ..."` from devkit root. Do not run the shell script (it may prompt); implement in Go so it’s non-interactive.
- **API**: `GET /api/submodule/sync-status` → `{ "needsSync": ["wabisaby-core", ...] }`. `POST /api/submodule/sync` → run sync (stage + commit), return success or error.
- **Router**: Register both routes; may need a small handler struct or reuse ProjectHandler with new methods.

Files: [dashboard/internal/git/git.go](dashboard/internal/git/git.go) (SubmoduleSyncStatus, or status + sync logic), [dashboard/internal/handler/projects.go](dashboard/internal/handler/projects.go) or new handler for sync, [dashboard/cmd/server/router.go](dashboard/cmd/server/router.go).

## Frontend

### 5. API client

- **projectsAPI**: Add `format(name)`, `lint(name)` (POST), and `getBulkStream(action)` returning `new EventSource(\`/api/projects/bulk/${action}/stream\`)`.
- **submoduleAPI** (new): `getSyncStatus()` → GET sync-status, `sync()` → POST sync.

File: [dashboard/static/js/api.js](dashboard/static/js/api.js)

### 6. Project card

- In the dropdown menu items, add "Format" and "Lint" (same pattern as Update, Run tests, Build), with actions `project:format` and `project:lint`.
- In projects.js (and app.js action registry), handle `project:format` and `project:lint`: call API, then start stream for that project’s format/lint (reuse same stream pattern as test/build), show in project logs modal. Disable buttons while format/lint is running (same as test/build).

Files: [dashboard/static/js/components/card.js](dashboard/static/js/components/card.js), [dashboard/static/js/projects.js](dashboard/static/js/projects.js), [dashboard/static/js/app.js](dashboard/static/js/app.js).

### 7. Bulk actions in Projects section

- In the Projects section header (where "Projects" title is), add buttons: "Format all", "Lint all", "Test all", "Build all". Each opens the same project-logs modal (or a dedicated bulk modal) and starts the bulk stream for that action; append lines to the modal. Reuse the existing project-logs modal for bulk output.
- Register handlers that call `projectsAPI.getBulkStream('format')` etc., and feed events into the modal content.

Files: [dashboard/static/index.html](dashboard/static/index.html) (buttons), [dashboard/static/js/projects.js](dashboard/static/js/projects.js) (bulk handlers), [dashboard/static/js/app.js](dashboard/static/js/app.js) (action registration if needed).

### 8. Submodule sync banner

- On dashboard load (and optionally on refresh), call `submoduleAPI.getSyncStatus()`. If `needsSync.length > 0`, show a banner above the dashboard content: "Submodule commits have changed. Sync to DevKit?" with a "Sync" button.
- On "Sync" click: call `submoduleAPI.sync()`, show success/error in activity log, refresh project list, hide banner (or re-fetch sync status).
- Banner can be a simple div with class `sync-banner`; style in main.css or components.css.

Files: [dashboard/static/index.html](dashboard/static/index.html) (banner markup or inject via JS), [dashboard/static/js/app.js](dashboard/static/js/app.js) or [dashboard/static/js/projects.js](dashboard/static/js/projects.js) (fetch on load, show/hide banner, sync click), [dashboard/static/css/components.css](dashboard/static/css/components.css) or [dashboard/static/css/main.css](dashboard/static/css/main.css).

## Implementation order

1. Backend: format/lint in HandleProjectAction and handleProjectOperationStream.
2. Router: add POST /format and /lint for projects.
3. Frontend: API format/lint + project card Format/Lint + stream (reuse test/build flow).
4. Backend: bulk stream handler + route.
5. Frontend: bulk buttons + modal stream.
6. Backend: git.SubmoduleSyncStatus + sync logic + GET/POST API.
7. Frontend: sync banner + Sync button + API.
