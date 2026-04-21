# Forge Desktop

Forge is a local-first desktop conductor for AI coding agents. It helps you create isolated Git workspaces, run Claude/Codex/Kimi agents, understand what changed, review work, run checks, and move safe changes toward a PR without turning Forge into a cloud platform or full IDE.

## Product Direction

- Simple workspace orchestration by default.
- Chat-first agent interaction with terminal/log depth available when needed.
- Clear workspace cockpit summaries for agent state, changes, checks, Git/PR readiness, and next action.
- Local trust: visible worktrees, recoverable sessions, explicit cleanup, and auditable risky actions.
- Progressive developer depth through scripts, profiles, context, review cockpit, and GitHub/CI integrations.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Tauri 2 + Rust
- SQLite via `rusqlite`

## Development

Install dependencies:

```bash
npm install
```

Run the web dev server:

```bash
npm run dev
```

Run the desktop app in development:

```bash
npm run tauri:dev
```

## Verification

```bash
npm run typecheck
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build

Web build:

```bash
npm run build
```

Desktop build:

```bash
npm run tauri:build
```

## Git / Generated Files

This repo ignores generated artifacts:

- `node_modules/`
- `dist/` and `dist-ssr/`
- `src-tauri/target/`
- `src-tauri/gen/`
- Forge-managed local workspaces under `forge/`
- local env files (`.env`, `.env.*`)

If generated files are accidentally tracked, remove them from the index before pushing:

```bash
git rm -r --cached --ignore-unmatch src-tauri/target src-tauri/gen forge
```
