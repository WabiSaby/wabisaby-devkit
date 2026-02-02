#!/bin/bash
# Show status of all submodules
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

log_header "Submodule Status"

# Get submodule info
for project in "${PROJECTS[@]}"; do
    status=$(get_submodule_status "$project")
    branch=$(get_submodule_branch "$project")
    commit=$(get_submodule_commit "$project")
    dirty=""
    
    if submodule_is_dirty "$project"; then
        dirty="${RED}*${NC}"
    fi
    
    case "$status" in
        " ")
            log_success "$project: $branch @ $commit$dirty"
            ;;
        "+")
            log_warn "$project: $branch @ $commit (ahead)$dirty"
            ;;
        "-")
            log_error "$project: $branch @ $commit (behind)$dirty"
            ;;
        "U")
            log_error "$project: $branch @ $commit (conflict)$dirty"
            ;;
        *)
            log_error "$project: Not initialized"
            ;;
    esac
done

echo ""
