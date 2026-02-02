# WabiSaby DevKit

Meta-repository and desktop app for WabiSaby platform development. This repository contains the **DevKit desktop application** (Wails) and organizes WabiSaby projects as git submodules under `projects/`, providing a consistent development environment for contributors.

## Repository structure

```
WabiSaby-DevKit/
├── .gitmodules              # Submodule configuration
├── LICENSE
├── README.md
├── Makefile                 # Repo-level commands (app, docker, cross-project)
├── app/                     # DevKit desktop app (Wails + Go + frontend)
│   ├── frontend/            # UI (Vite, JS)
│   ├── internal/             # App logic (config, git, services)
│   └── main.go
├── projects/                # Git submodules
│   ├── wabisaby-core/        # Main Go backend
│   ├── wabisaby-protos/      # Protocol buffer definitions
│   ├── wabisaby-plugin-sdk-go/
│   └── wabisaby-plugins/
├── scripts/                 # Cross-project scripts (test, build, format, submodules)
└── docker/                  # Docker Compose for local services
```

## Two ways to use DevKit

### 1. Using the DevKit app (end users)

Install or build the **DevKit desktop app** and use it to manage your WabiSaby projects and services. The app lets you choose where projects live (e.g. a folder of clones); you do **not** need to clone this meta-repo.

- **Build from source:** see [Building the app](#building-the-app) below.
- Projects and config are stored in app data (or a path you set via `WABISABY_PROJECTS_DIR`).

### 2. Developing DevKit or the platform (contributors)

Clone this repo and work with all projects in one tree. Submodules live under `projects/`. Use the root Makefile and scripts to run the app, run tests/builds across projects, and manage submodules.

**Setup:**

```bash
git clone <devkit-repo-url> && cd WabiSaby-DevKit
git submodule update --init --recursive
make setup   # optional: init deps, then run build/test
```

**Run the DevKit app (development mode):**

```bash
make start   # Wails dev mode; uses repo's projects/ if WABISABY_DEVKIT_ROOT is repo root
```

**Useful commands:**

| Command        | Description                          |
|----------------|--------------------------------------|
| `make start`   | Run DevKit app (Wails dev)           |
| `make app-build` | Build DevKit desktop binary         |
| `make status`  | Submodule status                     |
| `make update`  | Update submodules to latest          |
| `make sync`    | Record submodule commits in DevKit   |
| `make test`    | Run tests in all projects            |
| `make build`   | Build all projects                   |
| `make format`  | Format code in all projects          |
| `make lint`    | Lint all projects                    |
| `make docker-up` / `make docker-down` | Docker services (Postgres, Redis, MinIO, Vault, pgAdmin) |

## Building the app

From the repo root:

```bash
make app-build
# or
make -C app build
```

Binary is produced under `app/build/bin/` (platform-specific). For Wails dev mode (live reload), use `make start` (runs `make -C app dev`).

## Paths and submodules

- Submodules are under **`projects/<name>`** (see `.gitmodules`). Scripts use this layout.
- `wabisaby-core` and others use `go.mod` replace directives that assume the DevKit layout; they work when developing from this repo.
- To point the DevKit app at this repo’s projects: set `WABISABY_DEVKIT_ROOT` to the DevKit repo root (and optionally `WABISABY_PROJECTS_DIR` to `projects`).

## Docker services

Local development stack (Postgres, Redis, MinIO, Vault, pgAdmin). Default credentials are for **local use only**; do not use in production.

```bash
make docker-up
make docker-status
make docker-down
```

## Contributing

1. Make changes in the right project under `projects/` (or in `app/` for the DevKit app).
2. Commit and push in the individual project repo.
3. If you changed a submodule, update DevKit to point at the new commit:  
   `git add projects/<name>` then commit in this repo.

## License

MIT. See [LICENSE](LICENSE).
