# Forge Product Implementation Status

Updated: 2026-04-18

Forge is being shaped as a **local-first agent conductor**: simple by default, inspectable on demand, and focused on orchestration rather than cloud agents or full-IDE replacement.

## Direction

- Own the repo → workspace → agent → review → checks → PR/cleanup path.
- Keep chat as the primary experience.
- Make terminal, logs, diffs, checks, Git, context, and audit history available as progressive depth.
- Prefer explicit, visible, reversible actions over surprising background automation.
- Borrow useful ideas from other agent tools without chasing parity for its own sake.

## Completed Product Slices

### Stabilization

- Typecheck, lint, build, and Rust tests are green.
- Generated Forge workspaces are excluded from lint/build scans.
- Tracked `.DS_Store` was removed.
- README direction and setup notes were cleaned up.

### Workspace Cockpit

- Workspace cards and detail views now surface:
  - next action
  - agent state
  - changed-file summary
  - check state
  - PR/readiness state
  - trust/safety state
- Detail view now has cockpit sections for:
  - workspace status
  - checks and shipping
  - change understanding
  - ship flow
  - lifecycle
  - safe iteration

### Checks and Shipping

- `.forge/config.json` setup/run/teardown commands are surfaced in the cockpit.
- Setup and check commands can be started from the cockpit.
- Running check terminals can be stopped from the cockpit.
- A guided ship flow now walks through:
  - review changes
  - run checks
  - prepare PR
  - cleanup/archive

### Review and Change Understanding

- The cockpit shows changed files, rough diff size, staging state, and simple risk hints.
- Changed files link into the Review Cockpit.
- The Review Cockpit remains the deeper path for diff inspection and review work.
- The workspace cockpit now surfaces review blockers: merge-readiness reasons, local risk notes, cached/open PR comments, and quick PR-comment refresh.

### GitHub and CI Visibility

- PR status is fetched through `gh pr view` where available.
- The cockpit surfaces PR number/state, draft status, review decision, and check summary.

### Safety and Trust

- Auto-rebase is off by default and controlled by a Trust & Safety setting.
- Auto-rebase skips dirty workspaces instead of running background git changes over uncommitted work.
- Auto-rebase activity records previous/new HEADs and a manual reversal hint when it moves a branch.
- Auto-run setup for new workspaces is off by default.
- Risky configured workspace scripts are blocked by default and recorded in activity.
- Risky workspace scripts can be explicitly allowed from Settings.
- Shell command approvals/denials are recorded in workspace activity.
- Terminal interrupt/stop/close lifecycle actions are recorded in workspace activity.
- Session recovery returns per-session close/skip/failure reasons for inspectable recovery history.
- The Lifecycle cockpit now shows workspace health warnings, unhealthy terminal sessions, and a guarded Recover Sessions action.
- Explicit workspace port kills are recorded in activity with pid, command, port, and cwd.
- Workspace creation/setup activity uses durable timestamped audit records instead of placeholder timestamps.
- Destructive/lifecycle actions now explain consequences before running.

### Safe Iteration

- Git-backed checkpoints can be created manually.
- Dirty workspaces get automatic checkpoints before risky agent turns/chat runs.
- Checkpoint diffs can be previewed.
- Checkpoint refs can be explicitly deleted/abandoned through the backend API without changing workspace files.
- Branches can be created from checkpoint refs through the backend API without switching or modifying the workspace.
- The Safe Iteration cockpit can now branch from or abandon a checkpoint with explicit confirmations.
- Checkpoint restore is guarded:
  - refuses dirty current workspaces
  - confirms in UI
  - restores without committing

### Reusable Power Features

- Existing prompt templates are exposed through slash-style composer suggestions.
- Typing `/` in the agent composer shows:
  - built-in workflows
  - repo prompt templates from `.forge/prompts.json`
  - markdown prompt templates from `.forge/prompts/*.md`

### Workspace Configuration

- `.forge/config.json` is documented in [`docs/forge-config.md`](./forge-config.md).
- Workspace config now covers:
  - setup/run/teardown scripts
  - repo-defined agent profiles
  - local LLM profile metadata
  - MCP server metadata
- Built-in local Ollama profile is available as an inspectable terminal profile.
- Settings now includes an Agent Profiles & Local LLMs card for app-level profile management.
- App-level local profiles are saved in Forge settings and shared across workspaces.
- Installed Ollama models can be discovered from Settings and selected when creating local profiles.
- Local profiles can be tested from Settings for command availability, endpoint metadata, and Ollama model presence.
- Local profile tests also check localhost endpoint TCP reachability without sending prompts or starting servers.
- Local profile tests warn when a configured launch command matches Forge's risky-command patterns.
- Local profile args support simple shell-like quotes in Settings while keeping the final command preview inspectable.
- App-level local profiles can be edited, and built-in/repo local profiles can be loaded into the form as templates.
- Local profile JSON snippets can be copied from Settings for sharing through repo `.forge/config.json`.
- Settings can choose the default workspace agent profile, including local LLM profiles.
- Terminal/profile launches that match risky-command patterns are refused and recorded in activity.
- Starting a local/profile terminal records the resolved profile, local runtime metadata, endpoint, model, cwd, and command preview in activity.
- Repo-defined profiles can target local providers such as Ollama, llama.cpp, LM Studio, or OpenAI-compatible local CLIs.
- Local profile provider/endpoint/runtime metadata is included in agent prompt context.
- MCP config is parsed and validated without launching MCP processes yet.
- The workspace Config tab now shows repo-defined scripts, agent profiles, MCP servers, and MCP warnings as inspectable developer-depth metadata.

## Current Validation Commands

```bash
npm run typecheck
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Remaining Useful Next Slices

- Improve stale-session recovery/reconciliation after app restart.
- Add richer PR comments/review-thread handling in the cockpit.
- Add CI/check detail drill-down from the PR/check summary.
- Add repo/workspace MCP/profile/context configuration as a developer-depth feature.
- Add keyboard-first navigation for workspace/status/review flows.
