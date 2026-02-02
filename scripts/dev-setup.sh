#!/bin/bash
# Initial development setup for new developers
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

log_header "WabiSaby DevKit Setup"

# Check prerequisites
log_info "Checking prerequisites..."
if ! check_prerequisites; then
    log_error "Please install missing prerequisites and try again"
    exit 1
fi
log_success "Prerequisites OK"

# Check Go version
log_info "Checking Go version..."
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
log_info "Go version: $GO_VERSION"

# Check Docker
log_info "Checking Docker..."
if docker info >/dev/null 2>&1; then
    log_success "Docker is running"
else
    log_warn "Docker is not running. Start Docker and run this script again."
fi

# Initialize submodules
log_info "Initializing submodules..."
if (cd "$DEVKIT_ROOT" && git submodule update --init --recursive); then
    log_success "Submodules initialized"
else
    log_error "Failed to initialize submodules"
    exit 1
fi

# Check submodule status
echo ""
log_info "Submodule status:"
exec "$SCRIPT_DIR/submodule-status.sh"

# Download Go dependencies
log_info "Downloading Go dependencies..."
for project in "${PROJECTS[@]}"; do
    if [ -f "$(get_project_dir "$project")/go.mod" ]; then
        log_info "Downloading dependencies for $project..."
        if run_in_project "$project" go mod download; then
            log_success "$project: Dependencies downloaded"
        else
            log_warn "$project: Failed to download dependencies"
        fi
    fi
done

# Optional: Run initial builds
echo ""
read -p "Run initial builds? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    exec "$SCRIPT_DIR/build-all.sh"
fi

# Optional: Run initial tests
echo ""
read -p "Run initial tests? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    exec "$SCRIPT_DIR/test-all.sh"
fi

echo ""
log_success "Setup complete!"
log_info "Next steps:"
echo "  - Review README.md for development workflow"
echo "  - Run './scripts/submodule-status.sh' to check project status"
echo "  - Run 'make start' to start the DevKit desktop app"
