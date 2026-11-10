#!/usr/bin/env bash
# PR 본문에 넣을 데모 파일을 pr-assets/<이름> 고아 브랜치에 올리고,
# 커밋 SHA로 고정한 raw 주소를 마크다운으로 출력한다.
# 작업 트리와 현재 브랜치는 건드리지 않는다.
#
#   scripts/pr-assets.sh <이름> demo-output/a.gif [demo-output/b.gif ...]
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "사용법: $0 <이름> <파일...>" >&2
  exit 1
fi

name="$1"
shift
branch="pr-assets/${name}"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

tree_input=""
for file in "$@"; do
  [ -f "$file" ] || { echo "파일이 없어요: $file" >&2; exit 1; }
  blob="$(git hash-object -w "$file")"
  tree_input+="100644 blob ${blob}	$(basename "$file")"$'\n'
done
tree="$(printf '%s' "$tree_input" | git mktree)"
commit="$(git commit-tree "$tree" -m "PR 데모: ${name}")"

git push --force origin "${commit}:refs/heads/${branch}" >&2

for file in "$@"; do
  base="$(basename "$file")"
  echo "<img src=\"https://raw.githubusercontent.com/${repo}/${commit}/${base}\" alt=\"${base%.*}\" width=\"320\">"
done
