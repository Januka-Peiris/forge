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
- Workspace detail defaults to a simple status view with one Next Actions panel, with the fuller cockpit available through a Deep toggle.
- Simple Next Actions also shows PR draft readiness with lightweight preview/refresh/copy actions.
- Workspace cards were simplified around task, next action, agent/changes/checks, and PR/trust state; no-op card buttons were removed.
- Workspace search now includes current task text, and status/repo/agent/recent sorting is applied.
- Workspace list header now includes compact attention summaries for needs-action, running, review, and PR workspaces, backed by matching Review/PR filters.
- Needs-action now has its own filter so blocked/waiting/unread workspaces remain visible when drilling into the attention summary.
- Workspace list filters now show the narrowed count, active attention filter state, clear/reset actions, and a more useful empty state.
- Workspace list filtering, sorting, status counts, and attention summaries are memoized to keep keyboard navigation and long-list triage responsive.
- Workspace list supports keyboard-first quick actions via `Cmd/Ctrl+K` (command palette), direct workspace selection with `Cmd/Ctrl+1..9`, and previous/next workspace navigation with `[` / `]`.
- Workspace list header shows subtle shortcut hints for search, movement, and reset on larger screens.
- Selected workspace cards scroll into view during keyboard navigation, keeping long-list triage usable.

### Checks and Shipping

- `.forge/config.json` setup/run/teardown commands are surfaced in the cockpit.
- Setup and check commands can be started from the cockpit.
- Running check terminals can be stopped from the cockpit.
- The deep Ship Flow now previews the deterministic PR draft title, summary, key-change count, risk count, and top changes before PR creation.
- PR draft previews can be refreshed from the cockpit before opening the PR.
- PR draft markdown can be copied from the cockpit for manual review or reuse before opening the PR.
- Linked PRs now expose an Open PR action in both Simple Next Actions and deep Checks & Shipping when GitHub metadata includes a URL.
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
- Review Cockpit now groups PR comments by file path with general comments separately, shows comments needing attention, and keeps per-comment open-file/send/resolve/link actions local and explicit.
- Pending review cards now open the relevant workspace/review cockpit instead of showing non-functional approve/request-change actions, and they have a clearer empty state.
- Pending reviews are sorted by risk/churn and show high/medium/low counts before the card grid.
- Pending reviews show the top few items by default with an explicit show-more/show-fewer control to avoid cluttering the workspace list.

### GitHub and CI Visibility

- PR status is fetched through `gh pr view` where available.
- The cockpit surfaces PR number/state, draft status, review decision, and check summary.
- Deep Checks & Shipping shows failed/pending GitHub checks first, includes state/conclusion/details links, and uses a quiet empty state when no CI is reported.

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
- MCP developer-depth visibility now distinguishes enabled/disabled and stdio/http metadata, and agent/profile prompt context includes enabled/disabled MCP metadata without launching servers.

## Current Validation Commands

```bash
npm run typecheck
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Remaining Useful Next Slices

- Manual UX pass in the running app to tune spacing, default collapsed states, and copy.
- Optional future local LLM presets/adapters for LM Studio, llama.cpp, vLLM, or direct OpenAI-compatible HTTP.
- Optional deeper GitHub work: true review-thread resolution and CI log fetching.
- Optional MCP runtime launch support if Forge later chooses to manage MCP processes directly.
