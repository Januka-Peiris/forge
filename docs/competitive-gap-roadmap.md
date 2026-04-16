# Forge Competitive Gap Roadmap

This backlog tracks product gaps against Conductor, Superset, and Orca after the agent lifecycle P0 fix. It intentionally avoids personal defaults and favors broadly useful local agent-orchestration behavior.

## P0: Agent Lifecycle Reliability

- Distinguish **Interrupt**, **Stop agent**, and **Close session** in UI and backend semantics.
- Stop should terminate the active agent process tree, not just dismiss terminal UI state.
- Close should remove a finished session from the active workspace view while preserving history and output.
- Stale/orphaned sessions should be recoverable or safely reconciled without blocking a fresh session.

## P1: Parity Backlog

### Conductor-Inspired Gaps

- Workspace run/setup scripts.
- Testing panel and focused test workflows.
- Todos and reusable slash-command templates.
- Workspace MCP configuration.
- Checkpoints with revert-to-turn behavior.
- Deep links for opening a workspace or session directly.

### Superset-Inspired Gaps

- First-class configurable agent profiles beyond built-in Codex and Claude Code.
- Repo-defined setup/teardown scripts.
- More keyboard navigation for switching workspaces and controlling terminals.
- Desktop/API extension surface for automation.

### Orca-Inspired Gaps

- Split terminal panes and persistent layouts.
- Notifications, unread markers, and active-agent counts.
- Agent status reporting back into workspace cards.
- Built-in file explorer/editor plus markdown/image/PDF preview support.
- PR/CI status sync and conflict triage.
- Rich quick-jump/search across workspaces and files.

## P2: Better-Than-Parity Opportunities

- Process health checks for orphaned, stale, or UI-detached agents.
- Recover-session flow after app restart or PTY registry desync.
- A clear readiness pipeline: active agent → changed files → review summary → tests → PR readiness.
- One-click cleanup that stops sessions, verifies no child processes remain, then safely removes managed worktrees.
- App/repo/workspace agent profile defaults with custom CLI support.
