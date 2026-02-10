# WabiSaby DevKit v0.1.0

First release of **WabiSaby DevKit** — the desktop companion for WabiSaby platform development.

## What's included

- **Project management** — Clone, build, test, and monitor WabiSaby repos from one dashboard. Git status, branches, tags, dependency graphs, and one-click open in editor.
- **Infrastructure control** — Start/stop Docker services (Postgres, Redis, MinIO, Vault, Keycloak, pgAdmin), stream logs, and open service UIs from the app.
- **Backend services** — Run and monitor WabiSaby backend services (API, WebSocket, Mesh, Plugins), group-start, live logs, and database migrations.
- **Command palette** — `⌘K` / `Ctrl+K` to fuzzy-search every action.
- **Activity feed** — Real-time stream of activity across projects and services with filter and search.
- **Settings** — Configure project paths, validate prerequisites (Go, Node, Docker, Wails), manage env vars with masking, and keep submodules in sync.

## Requirements

- **Go** 1.22+ · **Node.js** + **npm** · **Git**
- [Wails v2](https://wails.io) (for building from source)
- **Docker** (optional, for local infrastructure)

## Downloads

Attached below: **macOS** (universal), **Linux** (amd64), and **Windows** (amd64). Unzip and run the binary (on macOS, open the `.app` bundle).

## Building from source

```bash
git clone https://github.com/WabiSaby/wabisaby-devkit.git && cd wabisaby-devkit
git submodule update --init --recursive
make setup && make app-build
# Binary: app/build/bin/
```
