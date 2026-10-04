# Contributing to glowup

glowup is pre-release. The code is still being built, so some of what is described here may not exist on `main` yet.

## Setup

Run `just --list` to see the dev commands. Each recipe wraps one of these:

```sh
pnpm install # just setup
pnpm check   # just check: `claude plugin validate` and tsc
pnpm test    # just test: `claude plugin test .`
```

You need Node 24, pnpm, just, and Claude Code 2.1.288 or later. To run the mod in a live session from your clone:

```sh
claude --plugin-dir .   # just dev
```

The session watches the folder and reloads the mod when you save a file.

## Branches and pull requests

- Branch off `main`. One change per branch.
- Every PR is squash merged. The PR title becomes the commit subject, so write it in the commit grammar below.
- Sign off every commit (`git commit -s`). The DCO check reads the `Signed-off-by` trailer and blocks a merge without it.
- No `Co-Authored-By` or tool-attribution trailers.

## Commit grammar

`type(scope): imperative subject`, under 60 characters.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`. Scope is the area: `pane`, `band`, `theme`, `pet`, `statusline`, `release`.

The body says what changed and why. It does not narrate how the answer was found.

## Mod rules

- A hook imports only its own files and `claude-code`.
- `$` is used only in `hooks/register.tsx`.

## Themes

A theme is a data-only JSON file. It holds no code and nothing in it is executed. Every color is written as `#rrggbb`.

To submit one, open a theme submission issue with the JSON file and a screenshot, or open a PR that adds the file.

## Gates

CI runs `pnpm check` and `pnpm test` on every PR.

## Releasing

Add entries under `## [Unreleased]` in `CHANGELOG.md` as you merge changes. To cut a release:

```sh
just release 0.1.0
git push --follow-tags
```

`just release` bumps `plugin.json` and `package.json`, dates the changelog section, then commits and tags. The pushed tag starts the release workflow, which checks the versions, runs `pnpm check` and `pnpm test`, and publishes the changelog section with the archives.

## Design changes

A new tab, a change to the theme file format, or anything that reads new data from the user's machine starts as an issue that states the design.

Decisions are recorded with [docket](https://github.com/NovusEdge/docket) in `.docket/`. Commit the ledger with the change it describes.

## Comments

A comment in code carries a fact the reader cannot get from the code. Paraphrase, investigation history, and section banners are deleted in review.

## Reporting a security issue

Open a private security advisory on the GitHub repository. Do not open a public issue for it. See [SECURITY.md](SECURITY.md).
