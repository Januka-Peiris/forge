# Mnemonic GPUI v3

## Run from Cargo

```bash
cargo run -p mnemonic-app
```

## Build a local macOS app bundle

```bash
scripts/bundle-mnemonic-gpui-macos.sh
open "target/macos/Mnemonic GPUI.app"
```

For an optimized binary:

```bash
scripts/bundle-mnemonic-gpui-macos.sh --release --open
```

The bundle uses the same app identifier and icon assets as the existing Tauri app:

- bundle id: `dev.mnemonic.desktop`
- icon: `src-tauri/icons/icon.icns`
- data dir: `~/Library/Application Support/dev.mnemonic.desktop`
- cache dir: `~/Library/Caches/dev.mnemonic.desktop`

## Automated smoke check

```bash
scripts/smoke-mnemonic-gpui.sh
```

To smoke the generated app bundle instead of the cargo-built binary:

```bash
scripts/smoke-mnemonic-gpui.sh --bundle
```

The smoke builds GPUI, launches it, captures a screenshot, and fails if the process exits early. It intentionally does not synthesize keyboard/mouse input because macOS Accessibility permissions often block that in agent environments.

To run the stronger in-app terminal self-test, which injects a `printf` command into the native Zed PTY and waits for the sentinel in terminal scrollback:

```bash
scripts/smoke-mnemonic-gpui.sh --self-test --seconds 20
```

## Runtime profiles

`mnemonic-core` exposes named background-service profiles so the v2/v3 terminal split is explicit:

- `BackgroundServiceOptions::gpui_visible_terminal()` keeps the legacy terminal WebSocket bridge disabled for GPUI v3 visible terminals.
- `BackgroundServiceOptions::tauri_v2()` keeps the terminal WebSocket bridge enabled for the existing Tauri v2 frontend.

This preserves the invariant that v3 visible terminal rendering is Zed/Alacritty PTY-backed rather than DOM/WebSocket-backed while v2 behavior remains intact.

## Manual terminal verification checklist

After the window opens:

1. Confirm the sidebar loads existing workspaces from `forge.sqlite3`.
2. Select a workspace and confirm the terminal prompt starts in that workspace root.
3. Type `ls` and confirm output, colors, resize, cursor, and selection behave correctly.
4. Use `Cmd+T`, `Cmd+Shift+T`, `Cmd+W`, and `Cmd+1` through `Cmd+9` to exercise terminal tabs.
5. Use `+ Claude` and confirm Claude Code launches with the existing agent profile arguments.
6. Confirm the visible GPUI terminal path is native Zed/Alacritty PTY rendering, not the v2 terminal WebSocket bridge.
7. Subjectively compare typing latency against Alacritty/Ghostty.

Do not run v2 and v3 concurrently for write-heavy database operations.
