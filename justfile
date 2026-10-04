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

# remove node_modules and the types Claude Code generates
[group('dev')]
clean:
    rm -rf node_modules .claude-plugin/types
