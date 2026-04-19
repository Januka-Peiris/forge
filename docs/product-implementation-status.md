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
- Auto-run setup for new workspaces is off by default.
- Risky configured workspace scripts are blocked by default and recorded in activity.
- Risky workspace scripts can be explicitly allowed from Settings.
- Shell command approvals/denials are recorded in workspace activity.
- Destructive/lifecycle actions now explain consequences before running.

### Safe Iteration

- Git-backed checkpoints can be created manually.
- Dirty workspaces get automatic checkpoints before risky agent turns/chat runs.
- Checkpoint diffs can be previewed.
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

