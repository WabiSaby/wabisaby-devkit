#!/bin/bash
# Run tests across all projects
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

PARALLEL=false
if [[ "${1:-}" == "--parallel" ]] || [[ "${1:-}" == "-p" ]]; then
    PARALLEL=true
fi

log_header "Running Tests Across All Projects"

RESULTS=()
FAILED=()

# Function to test a project
test_project() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        log_warn "$project: Not found, skipping"
        return 1
    fi
    
    log_info "Testing $project..."
    
    # Check for different test commands
    local test_cmd=""
    if [ -f "$project_dir/Makefile" ] && grep -q "test" "$project_dir/Makefile"; then
        test_cmd="make test"
    elif [ -f "$project_dir/go.mod" ]; then
        test_cmd="go test ./..."
    else
        log_warn "$project: No test command found, skipping"
        return 1
    fi
    
    if run_in_project "$project" bash -c "$test_cmd" > "/tmp/devkit-test-$project.log" 2>&1; then
        log_success "$project: Tests passed"
        RESULTS+=("$project: PASS")
        return 0
    else
        log_error "$project: Tests failed (see /tmp/devkit-test-$project.log)"
        RESULTS+=("$project: FAIL")
        FAILED+=("$project")
        return 1
    fi
}

# Run tests
if [ "$PARALLEL" = true ]; then
    log_info "Running tests in parallel..."
    for project in "${PROJECTS[@]}"; do
        test_project "$project" &
    done
    wait
else
    for project in "${PROJECTS[@]}"; do
        test_project "$project"
    fi
fi

# Summary
echo ""
log_header "Test Summary"
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
    log_success "All tests passed!"
    exit 0
fi
