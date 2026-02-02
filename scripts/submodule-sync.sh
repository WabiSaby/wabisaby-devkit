#!/bin/bash
# Sync submodule commits back to DevKit
set -euo pipefail

source "$(dirname "$0")/common.sh"

check_devkit_root

log_header "Syncing Submodules to DevKit"

# Check if there are changes to sync
CHANGED_SUBMODULES=()
for project in "${PROJECTS[@]}"; do
    if project_exists "$project"; then
        project_dir=$(get_project_dir "$project")
        # Check if submodule commit differs from what DevKit references
        current_commit=$(cd "$project_dir" && git rev-parse HEAD 2>/dev/null)
        devkit_commit=$(cd "$DEVKIT_ROOT" && git ls-tree HEAD "$(get_submodule_path "$project")" 2>/dev/null | awk '{print $3}')
        
        if [ "$current_commit" != "$devkit_commit" ]; then
            CHANGED_SUBMODULES+=("$project")
        fi
    fi
done

if [ ${#CHANGED_SUBMODULES[@]} -eq 0 ]; then
    log_info "No submodule changes to sync"
    exit 0
fi

# Show what will be synced
log_info "Submodules with changes:"
for project in "${CHANGED_SUBMODULES[@]}"; do
    commit=$(get_submodule_commit "$project")
    branch=$(get_submodule_branch "$project")
    echo "  - $project ($branch @ $commit)"
done

# Ask for confirmation if interactive
if [ -t 0 ]; then
    echo ""
    read -p "Sync these changes to DevKit? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi
fi

# Stage submodule changes
for project in "${CHANGED_SUBMODULES[@]}"; do
    log_info "Staging $project..."
    (cd "$DEVKIT_ROOT" && git add "$(get_submodule_path "$project")")
done

# Commit if there are staged changes
if (cd "$DEVKIT_ROOT" && git diff --cached --quiet); then
    log_info "No changes to commit"
else
    if [ -t 0 ]; then
        echo ""
        read -p "Commit message (or press Enter for default): " commit_msg
        if [ -z "$commit_msg" ]; then
            commit_msg="Update submodules: $(IFS=,; echo "${CHANGED_SUBMODULES[*]}")"
        fi
    else
        commit_msg="Update submodules: $(IFS=,; echo "${CHANGED_SUBMODULES[*]}")"
    fi
    
    (cd "$DEVKIT_ROOT" && git commit -m "$commit_msg")
    log_success "Committed submodule updates"
fi
