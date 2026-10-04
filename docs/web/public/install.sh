#!/bin/sh
# Installs the glowup mod into Claude Code:
#   curl -fsSL https://glowup.khimani.dev/install.sh | sh
# It downloads the glowup installer for this machine from the latest GitHub
# release, checks it against the release's checksums.txt, and runs it once from
# a temp folder. Nothing is installed on PATH and nothing needs sudo.
#
# Arguments after `sh -s --` go to the installer, for example:
#   curl -fsSL https://glowup.khimani.dev/install.sh | sh -s -- --pack crt
#
# GLOWUP_VERSION picks a release tag instead of the latest.
# GLOWUP_BASE_URL replaces https://github.com/NovusEdge/glowup/releases (CI points it at a fake release).
set -eu

repo_releases="https://github.com/NovusEdge/glowup/releases"
base="${GLOWUP_BASE_URL:-$repo_releases}"

say() { printf '%s\n' "$*"; }
die() { printf 'glowup: %s\n' "$*" >&2; exit 1; }

manual() {
	say "Install glowup by hand instead. In Claude Code, run:"
	say "  /plugin marketplace add NovusEdge/glowup"
	say "  /plugin install glowup@glowup"
}

say "glowup installer. To read this script first: curl -fsSL https://glowup.khimani.dev/install.sh | less"

case "$(uname -s)" in
	Linux) os=linux ;;
	Darwin) os=darwin ;;
	*) say "This script runs on Linux and macOS only."; manual; exit 1 ;;
esac
case "$(uname -m)" in
	x86_64 | amd64) arch=amd64 ;;
	aarch64 | arm64) arch=arm64 ;;
	*) say "There is no glowup installer built for $(uname -m)."; manual; exit 1 ;;
esac

if command -v curl >/dev/null 2>&1; then
	fetch() { curl -fsSL -o "$2" "$1"; }
	# -w prints the URL curl ended on after following redirects.
	final_url() { curl -fsSL -o /dev/null -w '%{url_effective}' "$1"; }
elif command -v wget >/dev/null 2>&1; then
	fetch() { wget -q -O "$2" "$1"; }
	final_url() { wget -S --spider "$1" 2>&1 | sed -n 's/^ *[Ll]ocation: *//p' | tail -n 1 | tr -d '\r'; }
else
	die "this script needs curl or wget"
fi

if [ -n "${GLOWUP_VERSION:-}" ]; then
	tag="$GLOWUP_VERSION"
else
	# .../releases/latest redirects to .../releases/tag/<tag>.
	# `|| tag=` keeps set -e from exiting with curl's message instead of ours.
	tag="$(final_url "$base/latest")" || tag=
	tag="${tag##*/}"
	case "$tag" in
		v*) ;;
		*) die "could not find the latest glowup release. Set GLOWUP_VERSION to a tag such as v0.3.0" ;;
	esac
fi

archive="glowup-installer_${tag}_${os}_${arch}.tar.gz"
tmp="$(mktemp -d 2>/dev/null || mktemp -d -t glowup)"
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM

say "Downloading the glowup installer $tag for $os/$arch..."
fetch "$base/download/$tag/$archive" "$tmp/$archive" || die "could not download $archive from $base/download/$tag/"
fetch "$base/download/$tag/checksums.txt" "$tmp/checksums.txt" || die "could not download checksums.txt for $tag"

# Check only our archive's line: checksums.txt also lists the other platforms'.
grep " $archive\$" "$tmp/checksums.txt" >"$tmp/want.txt" || die "checksums.txt has no entry for $archive"
if command -v sha256sum >/dev/null 2>&1; then
	(cd "$tmp" && sha256sum -c want.txt >/dev/null 2>&1) || die "checksum mismatch for $archive. Nothing was installed."
elif command -v shasum >/dev/null 2>&1; then
	(cd "$tmp" && shasum -a 256 -c want.txt >/dev/null 2>&1) || die "checksum mismatch for $archive. Nothing was installed."
else
	die "this script needs sha256sum or shasum to check the download"
fi

tar -xzf "$tmp/$archive" -C "$tmp" glowup-installer || die "could not unpack $archive"

# Piped through sh, our stdin is the script itself: give the installer the terminal
# instead. With no terminal at all (CI, a container), it installs with --yes.
if (: </dev/tty) 2>/dev/null; then
	"$tmp/glowup-installer" "$@" </dev/tty
else
	say "No terminal found: installing with the defaults (--yes)."
	"$tmp/glowup-installer" --yes "$@"
fi
