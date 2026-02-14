# WabiSaby DevKit Makefile
# Repo-level commands when developing the DevKit repo. End users manage projects
# (clone, update, sync) in the DevKit app; projects dir is configured there.
# App build/run: app/Makefile (Wails desktop app).

.PHONY: help status update sync test build format lint setup start app-build docker-up docker-down docker-status clean release-protos-go

# Default target
help:
	@echo "WabiSaby DevKit - Available commands:"
	@echo ""
	@echo "  make start        - Run DevKit app (Wails dev mode)"
	@echo "  make app-build    - Build DevKit desktop app (see app/Makefile)"
	@echo ""
	@echo "  make docker-up    - Start Docker services"
	@echo "  make docker-down  - Stop Docker services"
	@echo "  make docker-status - Show Docker service status"
	@echo ""
	@echo "  make test         - Run tests in all projects"
	@echo "  make build        - Build all projects"
	@echo "  make format       - Format code in all projects"
	@echo "  make lint         - Lint all projects"
	@echo "  make setup        - Initial development setup"
	@echo ""
	@echo "  make status       - Show submodule status (DevKit repo only)"
	@echo "  make update       - Update all submodules (DevKit repo only)"
	@echo "  make sync         - Sync submodule commits (DevKit repo only)"
	@echo ""
	@echo "  make release-protos-go        - Regenerate wabisaby-protos-go from protos (show changes)"
	@echo "  make release-protos-go VERSION=v0.0.2  - Regenerate, commit, and tag in protos-go"
	@echo ""
	@echo "  make clean        - Clean build artifacts"
	@echo ""
	@echo "Project management (clone, update, sync) for end users is done in the DevKit app."

# Submodule management (only when developing this repo with WABISABY_DEVKIT_ROOT set here)
status:
	@./scripts/submodule-status.sh

update:
	@./scripts/submodule-update-all.sh

sync:
	@./scripts/submodule-sync.sh

# Regenerate wabisaby-protos-go from wabisaby-protos. Optional: VERSION=v0.0.x to commit and tag.
release-protos-go:
	@./scripts/release-protos-go.sh $(VERSION)

# Cross-project operations
test:
	@./scripts/test-all.sh

build:
	@./scripts/build-all.sh

format:
	@./scripts/format-all.sh

format-check:
	@./scripts/format-all.sh --check

lint:
	@./scripts/lint-all.sh

# Setup
setup:
	@./scripts/dev-setup.sh

# Run the DevKit desktop app (Wails dev mode; build with: make -C app build)
start:
	@echo "Starting DevKit app (Wails)..."
	@$(MAKE) -C app dev

# Build the desktop app (convenience from repo root)
app-build:
	@$(MAKE) -C app build

# Docker services
docker-up:
	@echo "Starting Docker services..."
	@docker-compose -f docker/docker-compose.yml up -d
	@echo "Services started. Run 'make docker-status' to check status."

docker-down:
	@echo "Stopping Docker services..."
	@docker-compose -f docker/docker-compose.yml down

docker-status:
	@docker-compose -f docker/docker-compose.yml ps

docker-logs:
	@docker-compose -f docker/docker-compose.yml logs -f

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	@find . -type d -name "bin" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "coverage" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.log" -delete 2>/dev/null || true
	@echo "Clean complete"
