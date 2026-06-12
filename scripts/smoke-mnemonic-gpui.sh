#!/usr/bin/env bash
set -euo pipefail

profile="debug"
seconds="6"
mode="cargo"
open_after="false"
self_test="false"
out_dir="${TMPDIR:-/tmp}"

usage() {
  cat <<'USAGE'
Usage: scripts/smoke-mnemonic-gpui.sh [--release] [--seconds N] [--bundle] [--self-test] [--open]

Builds and launches Mnemonic GPUI long enough to catch startup/runtime panics,
captures a screenshot, and verifies the app stayed alive.

This smoke intentionally does not synthesize keyboard/mouse input. macOS
Accessibility permissions commonly block that in agent environments, so terminal
input/latency checks remain manual.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      profile="release"
      shift
      ;;
    --seconds)
      seconds="${2:?missing seconds value}"
      shift 2
      ;;
    --bundle)
      mode="bundle"
      shift
      ;;
    --self-test)
      self_test="true"
      shift
      ;;
    --open)
      open_after="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This smoke currently targets macOS because GPUI v3 is being verified with Metal." >&2
  exit 1
fi

if ! [[ "$seconds" =~ ^[0-9]+$ ]] || [[ "$seconds" -lt 1 ]]; then
  echo "--seconds must be a positive integer" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "$mode" == "bundle" ]]; then
  if [[ "$profile" == "release" ]]; then
    scripts/bundle-mnemonic-gpui-macos.sh --release
  else
    scripts/bundle-mnemonic-gpui-macos.sh
  fi
  binary="$repo_root/target/macos/Mnemonic GPUI.app/Contents/MacOS/mnemonic-app"
else
  cargo_args=(build -p mnemonic-app)
  [[ "$profile" == "release" ]] && cargo_args+=(--release)
  cargo "${cargo_args[@]}"
  binary="$repo_root/target/$profile/mnemonic-app"
fi

if [[ ! -x "$binary" ]]; then
  echo "GPUI binary not found or not executable: $binary" >&2
  exit 1
fi

mkdir -p "$out_dir"
timestamp="$(date +%Y%m%d-%H%M%S)"
screenshot="$out_dir/mnemonic-gpui-smoke-$timestamp.png"
stdout_log="$out_dir/mnemonic-gpui-smoke-$timestamp.stdout.log"
stderr_log="$out_dir/mnemonic-gpui-smoke-$timestamp.stderr.log"

p=""
cleanup() {
  if [[ -n "${p:-}" ]] && kill -0 "$p" >/dev/null 2>&1; then
    kill "$p" >/dev/null 2>&1 || true
    wait "$p" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "$self_test" == "true" ]]; then
  MNEMONIC_GPUI_SELF_TEST=1 MNEMONIC_GPUI_SELF_TEST_TIMEOUT_SECS="$seconds" \
    "$binary" >"$stdout_log" 2>"$stderr_log" &
  p=$!
  deadline=$((SECONDS + seconds))
  screenshot_taken="false"
  while kill -0 "$p" >/dev/null 2>&1; do
    if [[ "$screenshot_taken" == "false" && "$SECONDS" -ge $((deadline - seconds + 2)) ]]; then
      screencapture -x "$screenshot" || true
      screenshot_taken="true"
    fi
    if [[ "$SECONDS" -ge "$deadline" ]]; then
      echo "SMOKE FAILED: self-test did not finish within ${seconds}s" >&2
      echo "stdout: $stdout_log" >&2
      echo "stderr: $stderr_log" >&2
      tail -80 "$stderr_log" >&2 || true
      exit 1
    fi
    sleep 1
  done
  status=0
  wait "$p" || status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "SMOKE FAILED: self-test exited with status $status" >&2
    echo "stdout: $stdout_log" >&2
    echo "stderr: $stderr_log" >&2
    tail -80 "$stderr_log" >&2 || true
    exit 1
  fi
  echo "SMOKE PASSED: mnemonic-app self-test completed"
  echo "binary: $binary"
  [[ -s "$screenshot" ]] && echo "screenshot: $screenshot"
  echo "stdout: $stdout_log"
  echo "stderr: $stderr_log"
  if ! rg -q "MNEMONIC_GPUI_SELF_TEST passed" "$stderr_log" 2>/dev/null; then
    echo "SMOKE FAILED: self-test pass marker missing from stderr" >&2
    tail -80 "$stderr_log" >&2 || true
    exit 1
  fi
else
  "$binary" >"$stdout_log" 2>"$stderr_log" &
  p=$!
  sleep "$seconds"

  screencapture -x "$screenshot" || true

  if ! kill -0 "$p" >/dev/null 2>&1; then
    wait "$p" || status=$?
    status="${status:-0}"
    echo "SMOKE FAILED: mnemonic-app exited before ${seconds}s with status $status" >&2
    echo "stdout: $stdout_log" >&2
    echo "stderr: $stderr_log" >&2
    if [[ -s "$stderr_log" ]]; then
      echo "--- stderr tail ---" >&2
      tail -80 "$stderr_log" >&2
    fi
    exit 1
  fi

  if [[ ! -s "$screenshot" ]]; then
    echo "SMOKE FAILED: screenshot was not created: $screenshot" >&2
    exit 1
  fi

  size_bytes="$(wc -c <"$screenshot" | tr -d ' ')"
  if [[ "$size_bytes" -lt 50000 ]]; then
    echo "SMOKE FAILED: screenshot is unexpectedly small (${size_bytes} bytes): $screenshot" >&2
    exit 1
  fi

  if command -v sips >/dev/null 2>&1; then
    dimensions="$(sips -g pixelWidth -g pixelHeight "$screenshot" 2>/dev/null | awk '/pixelWidth|pixelHeight/ {print $2}' | paste -sdx -)"
  else
    dimensions="unknown"
  fi

  echo "SMOKE PASSED: mnemonic-app stayed running for ${seconds}s"
  echo "binary: $binary"
  echo "screenshot: $screenshot"
  echo "screenshot_bytes: $size_bytes"
  echo "screenshot_dimensions: $dimensions"
  echo "stdout: $stdout_log"
  echo "stderr: $stderr_log"

  if [[ "$open_after" == "true" ]]; then
    open "$screenshot"
  fi
fi

cat <<'CHECKLIST'

Manual checks still required for full plan completion:
- Manually type `ls` in the GPUI terminal to confirm keyboard input reaches the selected workspace shell; automated `--self-test` already verifies injected shell output and cwd.
- Confirm ANSI colors, cursor blink/shape, selection, copy/paste, and resize behavior.
- Exercise Cmd+T, Cmd+Shift+T, Cmd+W, and Cmd+1..9 terminal tab shortcuts.
- Launch Claude with `+ Claude` and confirm existing profile/bypass arguments are used.
- Subjectively compare typing latency against Alacritty/Ghostty.
CHECKLIST
