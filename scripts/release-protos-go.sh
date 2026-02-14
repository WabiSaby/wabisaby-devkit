#!/usr/bin/env bash
# Regenerate wabisaby-protos-go from wabisaby-protos and optionally commit + tag.
# Run from DevKit root. Assumes projects/wabisaby-protos and projects/wabisaby-protos-go exist.
#
# Usage:
#   ./scripts/release-protos-go.sh              # Generate only; show changes, no commit
#   ./scripts/release-protos-go.sh --commit     # Generate, commit in protos-go (no tag)
#   ./scripts/release-protos-go.sh v0.0.2       # Generate, commit, and tag v0.0.2
#
# After tagging, push from wabisaby-protos-go:
#   cd projects/wabisaby-protos-go && git push origin master && git push origin v0.0.2

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVKIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROTOS="$DEVKIT_ROOT/projects/wabisaby-protos"
PROTOS_GO="$DEVKIT_ROOT/projects/wabisaby-protos-go"
VERSION=""
DO_COMMIT=""

for arg in "$@"; do
  if [[ "$arg" == "--commit" ]]; then
    DO_COMMIT=1
  elif [[ "$arg" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    VERSION="$arg"
    DO_COMMIT=1
  fi
done

if [[ ! -d "$PROTOS" ]]; then
  echo "Error: wabisaby-protos not found at $PROTOS"
  exit 1
fi
if [[ ! -d "$PROTOS_GO" ]]; then
  echo "Error: wabisaby-protos-go not found at $PROTOS_GO"
  exit 1
fi

echo "→ Generating Go into wabisaby-protos-go..."
"$PROTOS/scripts/publish-to-protos-go.sh" "$PROTOS_GO"
cd "$PROTOS_GO"
go mod tidy

if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git status --short
  if [[ -n "$DO_COMMIT" ]]; then
    if [[ -n "$VERSION" ]]; then
      git commit -m "Release $VERSION: regenerate from wabisaby-protos"
      git tag "$VERSION"
      echo ""
      echo "Done. Tag $VERSION created. Push with:"
      echo "  cd projects/wabisaby-protos-go && git push origin master && git push origin $VERSION"
    else
      git commit -m "Regenerate from wabisaby-protos"
      echo ""
      echo "Done. Push with: cd projects/wabisaby-protos-go && git push origin master"
    fi
  else
    echo ""
    echo "Generated; uncommitted changes in projects/wabisaby-protos-go."
    echo "To commit: ./scripts/release-protos-go.sh --commit"
    echo "To commit and tag: ./scripts/release-protos-go.sh v0.0.x"
  fi
else
  echo "No changes after regeneration."
  if [[ -n "$DO_COMMIT" ]]; then
    echo "Nothing to commit or tag."
  fi
fi
