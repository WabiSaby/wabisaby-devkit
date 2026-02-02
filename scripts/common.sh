#!/bin/bash
# Common utilities for DevKit scripts
# Source this file in other scripts: source "$(dirname "$0")/common.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVKIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Project directories
PROJECTS=(
    "wabisaby-core"
    "wabisaby-protos"
    "wabisaby-plugin-sdk-go"
    "wabisaby-plugins"
)

# Logging functions
log_info() {
    echo -e "${BLUE}→${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}!${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_header() {
    echo -e "\n${BOLD}${CYAN}=== $1 ===${NC}\n"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    local missing=()
    
    if ! command_exists git; then
        missing+=("git")
    fi
    
    if ! command_exists go; then
        missing+=("go")
    fi
    
    if ! command_exists docker; then
        missing+=("docker")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing prerequisites: ${missing[*]}"
        return 1
    fi
    
    return 0
}

# Submodules live under projects/ (see .gitmodules)
SUBMODULES_DIR="projects"

# Get project directory (absolute path)
get_project_dir() {
    local project=$1
    echo "$DEVKIT_ROOT/$SUBMODULES_DIR/$project"
}

# Get submodule path for git commands (e.g. projects/wabisaby-core)
get_submodule_path() {
    local project=$1
    echo "$SUBMODULES_DIR/$project"
}

# Check if project exists
project_exists() {
    local project=$1
    [ -d "$(get_project_dir "$project")" ]
}

# Check if we're in DevKit root
check_devkit_root() {
    if [ ! -f "$DEVKIT_ROOT/.gitmodules" ]; then
        log_error "Not in DevKit root directory. Please run from WabiSaby-DevKit root."
        exit 1
    fi
}

# Run command in project directory
run_in_project() {
    local project=$1
    shift
    local cmd=("$@")
    
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        log_error "Project $project not found at $project_dir"
        return 1
    fi
    
    (cd "$project_dir" && "${cmd[@]}")
}

# Get submodule status
get_submodule_status() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        echo "missing"
        return
    fi
    
    (cd "$DEVKIT_ROOT" && git submodule status "$(get_submodule_path "$project")" 2>/dev/null | head -1 | cut -c1)
}

# Check if submodule has uncommitted changes
submodule_is_dirty() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        return 1
    fi
    
    (cd "$project_dir" && git diff --quiet && git diff --cached --quiet)
    [ $? -ne 0 ]
}

# Get current branch of submodule
get_submodule_branch() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        echo "unknown"
        return
    fi
    
    (cd "$project_dir" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
}

# Get commit hash of submodule
get_submodule_commit() {
    local project=$1
    local project_dir=$(get_project_dir "$project")
    
    if [ ! -d "$project_dir" ]; then
        echo "unknown"
        return
    fi
    
    (cd "$project_dir" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
}
