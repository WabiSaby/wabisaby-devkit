#!/bin/bash
# Build all projects
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

log_header "Building All Projects"

RESULTS=()
FAILED=()

# Function to build a project
build_project() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        log_warn "$project: Not found, skipping"
        return 1
    fi
    
    log_info "Building $project..."
    
    # Check for different build commands
    local build_cmd=""
    if [ -f "$project_dir/Makefile" ] && grep -q "build" "$project_dir/Makefile"; then
        build_cmd="make build"
    elif [ -f "$project_dir/go.mod" ]; then
        build_cmd="go build ./..."
    elif [ -f "$project_dir/package.json" ]; then
        build_cmd="npm run build"
    else
        log_warn "$project: No build command found, skipping"
        return 1
    fi
    
    if run_in_project "$project" bash -c "$build_cmd" > "/tmp/devkit-build-$project.log" 2>&1; then
        log_success "$project: Build successful"
        RESULTS+=("$project: SUCCESS")
        return 0
    else
        log_error "$project: Build failed (see /tmp/devkit-build-$project.log)"
        RESULTS+=("$project: FAIL")
        FAILED+=("$project")
        return 1
    fi
}

# Build projects
for project in "${PROJECTS[@]}"; do
    build_project "$project"
done

# Summary
echo ""
log_header "Build Summary"
for result in "${RESULTS[@]}"; do
    if [[ "$result" == *"SUCCESS"* ]]; then
        log_success "$result"
    else
        log_error "$result"
    fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    log_error "Failed projects: ${FAILED[*]}"
    exit 1
else
    echo ""
    log_success "All builds successful!"
    exit 0
fi
