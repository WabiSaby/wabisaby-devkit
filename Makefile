# WabiSaby DevKit Makefile
# Convenience commands for DevKit management

.PHONY: help status update sync test build format lint setup ui docker-up docker-down docker-status clean

# Default target
help:
	@echo "WabiSaby DevKit - Available commands:"
	@echo ""
	@echo "  make status       - Show submodule status"
	@echo "  make update       - Update all submodules"
	@echo "  make sync         - Sync submodule commits to DevKit"
	@echo "  make test         - Run tests in all projects"
	@echo "  make build        - Build all projects"
	@echo "  make format       - Format code in all projects"
	@echo "  make lint         - Lint all projects"
	@echo "  make setup        - Initial development setup"
	@echo "  make ui           - Start web dashboard"
	@echo "  make docker-up    - Start Docker services"
	@echo "  make docker-down  - Stop Docker services"
	@echo "  make docker-status - Show Docker service status"
	@echo "  make clean        - Clean build artifacts"

# Submodule management
status:
	@./scripts/submodule-status.sh

update:
	@./scripts/submodule-update-all.sh

sync:
	@./scripts/submodule-sync.sh

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

# Web dashboard
ui:
	@echo "Starting DevKit dashboard..."
	@echo "Open http://localhost:8080 in your browser"
	@cd ui && go run server.go

start:
	@echo "Starting DevKit dashboard..."
	@echo "Open http://localhost:8080 in your browser"
	@cd ui && go run server.go

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
