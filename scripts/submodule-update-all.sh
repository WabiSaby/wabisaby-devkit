#!/bin/bash
# Update all submodules to latest from their remotes
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

# Parse arguments
UPDATE_SPECIFIC=""
if [ $# -gt 0 ]; then
    UPDATE_SPECIFIC=("$@")
fi

log_header "Updating Submodules"

if [ ${#UPDATE_SPECIFIC[@]} -gt 0 ]; then
    # Update specific submodules
    for project in "${UPDATE_SPECIFIC[@]}"; do
        if project_exists "$project"; then
            log_info "Updating $project..."
            (cd "$DEVKIT_ROOT" && git submodule update --remote "$(get_submodule_path "$project")")
            log_success "Updated $project"
        else
            log_error "Project $project not found"
        fi
    done
else
    # Update all submodules
    log_info "Updating all submodules..."
    (cd "$DEVKIT_ROOT" && git submodule update --remote --recursive)
    log_success "Updated all submodules"
fi

echo ""
log_header "Current Status"
exec "$SCRIPT_DIR/submodule-status.sh"
