#!/bin/bash
# Lint all projects
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

EXIT_ON_ERROR=false
if [[ "${1:-}" == "--exit-on-error" ]] || [[ "${1:-}" == "-e" ]]; then
    EXIT_ON_ERROR=true
fi

log_header "Linting All Projects"

RESULTS=()
FAILED=()

# Function to lint a project
lint_project() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        log_warn "$project: Not found, skipping"
        return 1
    fi
    
    log_info "Linting $project..."
    
    # Check for different lint commands
    local lint_cmd=""
    
    if [ -f "$project_dir/Makefile" ] && grep -q "lint" "$project_dir/Makefile"; then
        lint_cmd="make lint"
    elif [ -f "$project_dir/go.mod" ]; then
        if command_exists golangci-lint; then
            lint_cmd="golangci-lint run"
        elif [ -f "$project_dir/.golangci.yml" ]; then
            lint_cmd="golangci-lint run"
        else
            log_warn "$project: No linter configured, skipping"
            return 1
        fi
    elif [ -f "$project_dir/package.json" ]; then
        if grep -q "\"lint\"" "$project_dir/package.json"; then
            lint_cmd="npm run lint"
        fi
    fi
    
    if [ -z "$lint_cmd" ]; then
        log_warn "$project: No lint command found, skipping"
        return 1
    fi
    
    if run_in_project "$project" bash -c "$lint_cmd" > "/tmp/devkit-lint-$project.log" 2>&1; then
        log_success "$project: Lint passed"
        RESULTS+=("$project: PASS")
        return 0
    else
        log_error "$project: Lint failed (see /tmp/devkit-lint-$project.log)"
        RESULTS+=("$project: FAIL")
        FAILED+=("$project")
        
        if [ "$EXIT_ON_ERROR" = true ]; then
            return 1
        fi
        return 1
    fi
}

# Lint projects
for project in "${PROJECTS[@]}"; do
    if ! lint_project "$project"; then
        if [ "$EXIT_ON_ERROR" = true ]; then
            break
        fi
    fi
done

# Summary
echo ""
log_header "Lint Summary"
for result in "${RESULTS[@]}"; do
    if [[ "$result" == *"PASS"* ]]; then
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
    log_success "All lint checks passed!"
    exit 0
fi
