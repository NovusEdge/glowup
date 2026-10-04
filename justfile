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
ci: check test packs-check installer-check installsh-test

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

# regenerate the installer's pack colors from hooks/packpresets.ts
[group('installer')]
packs:
    node installer/gen/packs.ts

# fail when the installer's pack colors differ from hooks/packpresets.ts
[group('installer')]
packs-check:
    node installer/gen/packs.ts --check

# gofmt, vet and test the installer
[group('installer')]
installer-check:
    cd installer && gofmt -l . | (! grep .) && go vet ./... && go test ./...

# build the installer for this machine as installer/glowup-installer
[group('installer')]
installer-build:
    cd installer && go build -ldflags "-s -w -X main.version=$(git describe --tags --always)" -o glowup-installer .

# run the installer from source against your real Claude Code, e.g. just installer-run --dry-run
[group('installer')]
installer-run *args:
    cd installer && go run . {{args}}

# test install.sh against fake releases (CI also runs shellcheck on it)
[group('installer')]
installsh-test:
    sh installer/scripts/test-install-sh.sh

# remove node_modules and the types Claude Code generates
[group('dev')]
clean:
    rm -rf node_modules .claude-plugin/types

# serve the docs site with hot reload
[group('docs')]
docs-dev:
    pnpm -C docs/web install --ignore-workspace
    pnpm -C docs/web dev

# build the docs site and check its links
[group('docs')]
docs-build:
    pnpm -C docs/web install --ignore-workspace
    pnpm -C docs/web build
    pnpm -C docs/web check
