# show available recipes
default:
    @just --list

# install dependencies
[group('dev')]
setup:
    pnpm install

# validate the manifests and type-check
[group('dev')]
check:
    pnpm check

# run the mod's tests
[group('dev')]
test:
    pnpm test

# everything CI runs, in CI's order
[group('dev')]
ci: check test

# open Claude Code with this checkout loaded as the mod
[group('dev')]
dev *args:
    claude --plugin-dir . {{args}}

# add this checkout as a marketplace and install the mod from it
[group('install')]
install:
    claude plugin marketplace add .
    claude plugin install glowup@glowup

# bump both manifests, stamp the changelog, commit and tag; push is left to you
[group('release')]
release VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    test -z "$(git status --porcelain)" || { echo "working tree is dirty" >&2; exit 1; }
    grep -q '^## \[Unreleased\]' CHANGELOG.md || { echo "CHANGELOG.md has no Unreleased heading" >&2; exit 1; }
    # sed, not jq: jq would reflow the hand-formatted manifests into a noisy diff
    for f in .claude-plugin/plugin.json package.json; do
        sed -E 's/^(  "version": )"[^"]*"/\1"{{VERSION}}"/' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
        test "$(jq -r .version "$f")" = "{{VERSION}}"
    done
    awk -v v="{{VERSION}}" -v d="$(date +%F)" '
        { print }
        /^## \[Unreleased\]/ { print ""; print "## [" v "] - " d }
    ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
    git commit -sam "chore(release): v{{VERSION}}"
    git tag -a "v{{VERSION}}" -m "glowup v{{VERSION}}"
    echo "tagged v{{VERSION}}; publish with: git push --follow-tags"

# remove node_modules and the types Claude Code generates
[group('dev')]
clean:
    rm -rf node_modules .claude-plugin/types
