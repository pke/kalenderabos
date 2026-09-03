#!/usr/bin/env bash
set -euo pipefail

source_directory=$(realpath "$1")
route=${2:-}
root_asset=${3:-}
runner_temp=${RUNNER_TEMP:?RUNNER_TEMP is required}
state_directory="$runner_temp/pages-state"
artifact_directory="$runner_temp/pages-artifact"

case "$route" in
  ""|schulferien|aesales) ;;
  *)
    echo "Unsupported Pages route: $route" >&2
    exit 1
    ;;
esac

case "$root_asset" in
  "") ;;
  aesales.ics)
    if [[ "$route" != "aesales" ]]; then
      echo "Root asset aesales.ics requires the aesales route" >&2
      exit 1
    fi
    ;;
  *)
    echo "Unsupported Pages root asset: $root_asset" >&2
    exit 1
    ;;
esac

case "$state_directory" in
  "$runner_temp"/*) ;;
  *)
    echo "Unsafe Pages state directory" >&2
    exit 1
    ;;
esac

rm -rf -- "$state_directory" "$artifact_directory"

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch origin gh-pages
  git worktree add --detach "$state_directory" origin/gh-pages
else
  git worktree add --detach "$state_directory" HEAD
  git -C "$state_directory" switch --orphan gh-pages
fi

if [[ -n "$route" ]]; then
  target_directory="$state_directory/$route"
  rm -rf -- "$target_directory"
  mkdir -p "$target_directory"
  cp -a "$source_directory/." "$target_directory/"
  if [[ -n "$root_asset" ]]; then
    if [[ ! -f "$source_directory/$root_asset" ]]; then
      echo "Missing Pages root asset: $source_directory/$root_asset" >&2
      exit 1
    fi
    rm -f -- "$target_directory/$root_asset"
    cp -a "$source_directory/$root_asset" "$state_directory/$root_asset"
  fi
else
  if [[ -e "$source_directory/schulferien" || -e "$source_directory/aesales" || -e "$source_directory/aesales.ics" ]]; then
    echo "Homepage output must not contain assembled applications" >&2
    exit 1
  fi
  cp -a "$source_directory/." "$state_directory/"
fi

git -C "$state_directory" config user.name "github-actions[bot]"
git -C "$state_directory" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$state_directory" add -A
if ! git -C "$state_directory" diff --cached --quiet; then
  git -C "$state_directory" commit -m "chore(pages): publish ${route:-homepage}"
  git -C "$state_directory" push origin HEAD:gh-pages
fi

mkdir -p "$artifact_directory"
rsync -a --exclude=.git "$state_directory/" "$artifact_directory/"
echo "artifact-directory=$artifact_directory" >> "$GITHUB_OUTPUT"
