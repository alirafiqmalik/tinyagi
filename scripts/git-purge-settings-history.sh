#!/usr/bin/env bash
# Remove settings.json from the entire Git history (this repo root = TinyAGI project root).
# Requires git-filter-repo. See CONTRIBUTING.md — Secrets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_TOP="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$GIT_TOP"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo is not installed or not in PATH."
  echo "Install: https://github.com/newren/git-filter-repo/blob/main/INSTALL.md"
  exit 1
fi

echo "Git root: $GIT_TOP"
echo "Will remove settings.json from all history."
echo "git-filter-repo removes the 'origin' remote by default — re-add it after."
read -r -p "Continue? [y/N] " ok
case "$ok" in
  y|Y|yes|YES) ;;
  *) echo "Aborted."; exit 1 ;;
esac

git filter-repo --path settings.json --invert-paths --force

echo ""
echo "Next: git remote add origin <url>  # if needed"
echo "      git push --force origin --all && git push --force origin --tags"
echo ""
