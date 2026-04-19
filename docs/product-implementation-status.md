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
- Explicit workspace port kills are recorded in activity with pid, command, port, and cwd.
- Workspace creation/setup activity uses durable timestamped audit records instead of placeholder timestamps.
- Destructive/lifecycle actions now explain consequences before running.

### Safe Iteration

- Git-backed checkpoints can be created manually.
- Dirty workspaces get automatic checkpoints before risky agent turns/chat runs.
- Checkpoint diffs can be previewed.
- Checkpoint refs can be explicitly deleted/abandoned through the backend API without changing workspace files.
- Branches can be created from checkpoint refs through the backend API without switching or modifying the workspace.
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
  - MCP server metadata
- MCP config is parsed and validated without launching MCP processes yet.

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
- Add stronger checkpoint history controls, including abandon/branch-from-checkpoint flows.
- Add repo/workspace MCP/profile/context configuration as a developer-depth feature.
- Add keyboard-first navigation for workspace/status/review flows.
