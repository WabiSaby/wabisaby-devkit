#!/bin/bash
# Format code in all projects
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]] || [[ "${1:-}" == "-c" ]]; then
    CHECK_ONLY=true
fi

log_header "Formatting Code in All Projects"

RESULTS=()
FAILED=()

# Function to format a project
format_project() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        log_warn "$project: Not found, skipping"
        return 1
    fi
    
    log_info "Formatting $project..."
    
    # Check for different format commands
    local format_cmd=""
    local check_cmd=""
    
    if [ -f "$project_dir/Makefile" ]; then
        if grep -q "fmt" "$project_dir/Makefile"; then
            format_cmd="make fmt"
            check_cmd="make fmt-check"
        fi
    fi
    
    if [ -f "$project_dir/go.mod" ]; then
        if [ -z "$format_cmd" ]; then
            if command_exists gofumpt; then
                format_cmd="gofumpt -w ."
                check_cmd="gofumpt -l ."
            else
                format_cmd="go fmt ./..."
                check_cmd="test -z \$(go fmt ./...)"
            fi
        fi
    elif [ -f "$project_dir/package.json" ]; then
        if command_exists prettier; then
            format_cmd="prettier --write ."
            check_cmd="prettier --check ."
        fi
    fi
    
    if [ -z "$format_cmd" ]; then
        log_warn "$project: No format command found, skipping"
        return 1
    fi
    
    if [ "$CHECK_ONLY" = true ]; then
        if run_in_project "$project" bash -c "$check_cmd" > "/tmp/devkit-format-$project.log" 2>&1; then
            log_success "$project: Format check passed"
            RESULTS+=("$project: OK")
            return 0
        else
            log_error "$project: Format check failed (see /tmp/devkit-format-$project.log)"
            RESULTS+=("$project: FAIL")
            FAILED+=("$project")
            return 1
        fi
    else
        if run_in_project "$project" bash -c "$format_cmd" > "/tmp/devkit-format-$project.log" 2>&1; then
            log_success "$project: Formatted"
            RESULTS+=("$project: OK")
            return 0
        else
            log_error "$project: Format failed (see /tmp/devkit-format-$project.log)"
            RESULTS+=("$project: FAIL")
            FAILED+=("$project")
            return 1
        fi
    fi
}

# Format projects
for project in "${PROJECTS[@]}"; do
    format_project "$project"
done

# Summary
echo ""
log_header "Format Summary"
for result in "${RESULTS[@]}"; do
    if [[ "$result" == *"OK"* ]]; then
        log_success "$result"
    else
        log_error "$result"
    fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    if [ "$CHECK_ONLY" = true ]; then
        log_error "Some projects need formatting: ${FAILED[*]}"
    else
        log_error "Failed projects: ${FAILED[*]}"
    fi
    exit 1
else
    echo ""
    log_success "All projects formatted!"
    exit 0
fi
