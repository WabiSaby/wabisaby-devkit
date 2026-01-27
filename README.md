# WabiSaby DevKit

Meta-repository for WabiSaby platform development. This repository organizes all WabiSaby projects as git submodules, providing a consistent development environment for core developers.

## What is DevKit?

DevKit is a meta-repository that contains all WabiSaby projects as git submodules:
- **wabisaby-core** - Main Go backend service
- **wabisaby-protos** - Protocol buffer definitions
- **wabisaby-plugin-sdk-go** - Plugin SDK for Go
- **wabisaby-plugins** - Plugin implementations

## Why Use DevKit?

- **Consistent Paths**: All developers use the same directory structure
- **No Path Conflicts**: `go.mod` replace directives work automatically
- **Easy Updates**: Update all projects with a single command
- **Better Integration**: Test changes across multiple projects simultaneously

## Quick Start

### Initial Setup

1. **Clone the DevKit repository:**
   ```bash
   git clone <devkit-repo-url> && cd WabiSaby-DevKit
   ```

2. **Initialize all submodules:**
   ```bash
   git submodule update --init --recursive
   ```

This will checkout all WabiSaby projects into their respective directories.

### Development Workflow

1. **Navigate to a project:**
   ```bash
   cd wabisaby-core
   # or
   cd wabisaby-protos
   # etc.
   ```

2. **Make changes** in any project as you normally would

3. **Commit changes** in the individual project repositories (submodules)

4. **Update DevKit** to point to new commits:
   ```bash
   # From DevKit root
   git add wabisaby-core  # or whichever project you updated
   git commit -m "Update wabisaby-core to latest"
   ```

### Updating Projects

To update all projects to their latest commits from their respective repositories:

```bash
git submodule update --remote
```

To update a specific project:

```bash
git submodule update --remote wabisaby-core
```

### Working with Submodules

**Check current submodule commits:**
```bash
git submodule status
```

**Update to specific commit/branch:**
```bash
cd wabisaby-core
git checkout <branch-or-commit>
cd ..
git add wabisaby-core
git commit -m "Update wabisaby-core to <branch-or-commit>"
```

**Initialize submodules after cloning:**
```bash
git submodule update --init --recursive
```

## Project Structure

```
WabiSaby-DevKit/
├── .gitmodules                    # Submodule configuration
├── README.md                      # This file
├── .gitignore                     # Git ignore rules
├── wabisaby-core/                 # (submodule) Main Go backend
├── wabisaby-protos/               # (submodule) Protocol buffers
├── wabisaby-plugin-sdk-go/       # (submodule) Plugin SDK
└── wabisaby-plugins/              # (submodule) Plugin implementations
```

## Path Configuration

The `wabisaby-core/go.mod` file uses `../` paths that are optimized for DevKit structure:
- `../wabisaby-protos` - Points to the protos submodule
- `../wabisaby-plugin-sdk-go` - Points to the plugin SDK submodule

These paths work automatically when working inside DevKit. For CI, a script (`scripts/ci-adjust-gomod.sh`) converts these paths to `./` paths.

## Contributing

1. Make changes in the appropriate project submodule
2. Commit and push changes in the individual project repository
3. Update DevKit to reference the new commits
4. Push DevKit updates

## Development Utilities

DevKit includes a suite of development utilities to streamline your workflow:

### Scripts

All scripts are located in the `scripts/` directory:

- **`submodule-status.sh`** - Show status of all submodules
- **`submodule-update-all.sh`** - Update all submodules to latest
- **`submodule-sync.sh`** - Sync submodule commits back to DevKit
- **`test-all.sh`** - Run tests across all projects
- **`build-all.sh`** - Build all projects
- **`format-all.sh`** - Format code in all projects
- **`lint-all.sh`** - Lint all projects
- **`dev-setup.sh`** - Initial development setup

### Makefile Commands

For convenience, use the Makefile:

```bash
make status       # Show submodule status
make update       # Update all submodules
make sync         # Sync submodule commits to DevKit
make test         # Run tests in all projects
make build        # Build all projects
make format       # Format code in all projects
make lint         # Lint all projects
make setup        # Initial development setup
make ui           # Start web dashboard
make docker-up    # Start Docker services
make docker-down  # Stop Docker services
```

### Web Dashboard

DevKit includes a simple web-based dashboard for managing projects:

**Start the dashboard:**
```bash
make start
# or
make ui
```

Then open http://localhost:8080 in your browser.

**Dashboard features:**
- **Real-time project status**: Shows actual branch, commit, and dirty state for each project
- **Service management**: Start/stop individual services or all services at once
- **Service status**: Real-time Docker container status checking
- **Project actions**: Update, test, and build projects directly from the UI
- **Activity logs**: View recent operations and their results

**Dashboard features:**
- View project status (branch, commit, dirty state)
- Quick actions (update, test, build)
- Service status monitoring
- Activity logs

### Docker Services

DevKit includes a unified Docker Compose setup:

```bash
make docker-up      # Start all services
make docker-down    # Stop all services
make docker-status  # Check service status
make docker-logs    # View service logs
```

Services included:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MinIO (ports 9000, 9001)
- Vault (port 8200)
- pgAdmin (port 5050)

## Troubleshooting

**Submodules show as modified:**
- This is normal if you've made changes in a submodule
- Commit changes in the submodule, then update DevKit

**Can't find a project:**
- Make sure you ran `git submodule update --init --recursive`
- Check that the submodule URL in `.gitmodules` is correct

**Path errors in go.mod:**
- Ensure you're working from the DevKit root
- Verify all submodules are initialized
- Check that submodule directories exist

**Scripts not working:**
- Make sure scripts are executable: `chmod +x scripts/*.sh`
- Check that you're running from DevKit root directory

## Individual Project Development

While DevKit is recommended for core developers, individual projects can still be developed standalone:
- See each project's README for standalone setup instructions
- Note that `go.mod` replace directives are optimized for DevKit
- Standalone development may require manual path adjustments
