#!/bin/sh
# Lays out a GitHub-release-shaped folder for install.sh to download from:
#   fake-release.sh BINARY OUTDIR TAG
# writes OUTDIR/download/TAG/glowup-installer_TAG_<os>_<arch>.tar.gz and
# checksums.txt for this machine, named the way release.yml names them.
set -eu

bin="$1" out="$2" tag="$3"

case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) echo "unsupported OS" >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64 | amd64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "unsupported arch" >&2; exit 1 ;; esac

dir="$out/download/$tag"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$dir"
cp "$bin" "$stage/glowup-installer"
chmod +x "$stage/glowup-installer"
archive="glowup-installer_${tag}_${os}_${arch}.tar.gz"
tar -czf "$dir/$archive" -C "$stage" glowup-installer
cd "$dir"
if command -v sha256sum >/dev/null 2>&1; then
	sha256sum "$archive" >checksums.txt
else
	shasum -a 256 "$archive" >checksums.txt
fi
