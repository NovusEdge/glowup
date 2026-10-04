#!/bin/sh
# Runs docs/web/public/install.sh against fake releases whose "installer" is a
# stub that prints its arguments, so the script is tested without the real
# installer or the network. Run from the repo root.
set -eu

root="$(pwd)"
script="$root/docs/web/public/install.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tag=v0.0.0-test
fail=0

cat >"$work/stub" <<'EOF'
#!/bin/sh
echo "stub-installer ran with: $*"
EOF

sh "$root/installer/scripts/fake-release.sh" "$work/stub" "$work/good" "$tag"

# setsid detaches from the controlling terminal where it exists, so /dev/tty
# cannot be opened even when this test runs from an interactive shell.
no_tty() { if command -v setsid >/dev/null 2>&1; then setsid "$@"; else "$@"; fi; }

check() { # name, expected exit code, expected text, command...
	name="$1" want_code="$2" want_text="$3"
	shift 3
	set +e
	out="$("$@" 2>&1)"
	code=$?
	set -e
	if [ "$code" != "$want_code" ] || ! printf '%s' "$out" | grep -qF -- "$want_text"; then
		echo "FAIL $name: exit $code (want $want_code), output:"
		printf '%s\n' "$out" | sed 's/^/    /'
		fail=1
	else
		echo "ok   $name"
	fi
}

run() { # base-dir, args...
	base="$1"
	shift
	no_tty env GLOWUP_BASE_URL="file://$base" GLOWUP_VERSION="$tag" sh "$script" "$@" </dev/null
}

check "forwards arguments and adds --yes with no terminal" 0 "stub-installer ran with: --yes --dry-run --pack crt" run "$work/good" --dry-run --pack crt
check "says it is using the defaults" 0 "No terminal found" run "$work/good"

cp -R "$work/good" "$work/bad"
archive="$(cd "$work/bad/download/$tag" && ls glowup-installer_*.tar.gz)"
printf 'tampered' >>"$work/bad/download/$tag/$archive"
check "checksum mismatch stops before running" 1 "checksum mismatch" run "$work/bad"
check "checksum mismatch runs nothing" 1 "Nothing was installed" run "$work/bad"

cp -R "$work/good" "$work/other"
printf '0000  glowup-installer_%s_plan9_mips.tar.gz\n' "$tag" >"$work/other/download/$tag/checksums.txt"
check "no checksum entry for this platform" 1 "no entry for $archive" run "$work/other"

check "missing release" 1 "could not download" env GLOWUP_BASE_URL="file://$work/nowhere" GLOWUP_VERSION="$tag" sh "$script"

# file:// has no redirect, so .../latest cannot resolve: the same as GitHub being unreachable.
check "latest release cannot be found" 1 "could not find the latest glowup release" env GLOWUP_BASE_URL="file://$work/good" sh "$script"

mkdir "$work/shim"
cat >"$work/shim/uname" <<'EOF'
#!/bin/sh
case "$1" in -s) echo FreeBSD ;; -m) echo amd64 ;; esac
EOF
chmod +x "$work/shim/uname"
check "unsupported OS prints the manual steps" 1 "/plugin marketplace add NovusEdge/glowup" env PATH="$work/shim:$PATH" sh "$script"

if [ "$fail" = 0 ]; then
	echo "install.sh: all checks passed"
fi
exit "$fail"
