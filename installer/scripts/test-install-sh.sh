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
if run "$work/bad" 2>&1 | grep -q "stub-installer ran"; then
	echo "FAIL checksum mismatch still ran the installer"
	fail=1
else
	echo "ok   checksum mismatch never starts the installer"
fi

cp -R "$work/good" "$work/other"
printf '0000  glowup-installer_%s_plan9_mips.tar.gz\n' "$tag" >"$work/other/download/$tag/checksums.txt"
check "no checksum entry for this platform" 1 "no entry for $archive" run "$work/other"

check "missing release" 1 "could not download" env GLOWUP_BASE_URL="file://$work/nowhere" GLOWUP_VERSION="$tag" sh "$script"

# file:// has no redirect, so .../latest cannot resolve: the same as GitHub being unreachable.
check "latest release cannot be found" 1 "could not find the latest glowup release" env GLOWUP_BASE_URL="file://$work/good" sh "$script"

cp -R "$work/good" "$work/star"
sum="$(cut -d' ' -f1 "$work/star/download/$tag/checksums.txt")"
printf '%s *%s\n' "$sum" "$archive" >"$work/star/download/$tag/checksums.txt"
check "binary-mode checksum line is accepted" 0 "stub-installer ran with" run "$work/star"

# wget path: needs a real HTTP server, since wget cannot fetch file://. The shim
# bin dir links only the tools install.sh uses, so curl is not on PATH.
if ! command -v wget >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
	echo "SKIP: wget not installed (or no python3), wget path not tested"
else
	cat >"$work/serve.py" <<'EOF'
import functools, http.server, sys

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/latest":
            self.send_response(302)
            self.send_header("Location", "/tag/" + sys.argv[2])
            self.end_headers()
            return
        super().do_GET()
    def do_HEAD(self):
        if self.path == "/latest":
            return self.do_GET()
        super().do_HEAD()
    def log_message(self, *a):
        pass

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=sys.argv[1]))
with open(sys.argv[3], "w") as f:
    f.write(str(srv.server_address[1]))
srv.serve_forever()
EOF
	python3 "$work/serve.py" "$work/good" "$tag" "$work/port" &
	server=$!
	trap 'kill "$server" 2>/dev/null; rm -rf "$work"' EXIT
	i=0
	while [ ! -s "$work/port" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
	port="$(cat "$work/port")"

	mkdir "$work/wgetbin"
	for t in wget uname mktemp rm tar gzip grep sed tail tr awk cut sha256sum shasum cat env setsid; do
		p="$(command -v "$t" 2>/dev/null || true)"
		case "$p" in /*) ln -s "$p" "$work/wgetbin/$t" ;; esac
	done
	wget_run() { # args... ; env vars come from the caller via env
		no_tty env PATH="$work/wgetbin" "$@" </dev/null
	}
	check "wget: GLOWUP_VERSION download" 0 "stub-installer ran with: --yes" \
		wget_run GLOWUP_BASE_URL="http://127.0.0.1:$port" GLOWUP_VERSION="$tag" /bin/sh "$script"
	check "wget: latest tag from the redirect" 0 "Downloading the glowup installer $tag" \
		wget_run GLOWUP_BASE_URL="http://127.0.0.1:$port" /bin/sh "$script"
fi

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
