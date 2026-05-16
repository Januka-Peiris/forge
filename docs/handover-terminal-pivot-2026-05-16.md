# Handover: Terminal-First Pivot

**Date:** 2026-05-16  
**Branch:** `jay/pivot-to-terminal-sdk`  
**Last commit:** `116e75b3`  
**Status:** Tasks 1–4 complete, both TS and Rust compile clean. Needs smoke test before merge.

---

## Why this was done

Anthropic announced that `claude -p` (non-interactive / Agent SDK) usage will draw from a **separate credit pool** starting **June 15, 2026**, rather than subscription limits. Interactive `claude` in a terminal continues on subscription limits unchanged.

Reference: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

Wellington had two parallel Claude paths:
- **`agent_chat_service.rs`** — spawns `claude -p --output-format stream-json` → SDK credits ⚠️
- **`terminal_service` (PTY)** — runs interactive `claude` → subscription safe ✅

This change removes the chat path and makes the PTY terminal the sole Claude interface.

---

## What was changed

All changes are in a single commit (`116e75b3`) on `jay/pivot-to-terminal-sdk`.

### Frontend (TypeScript)

| File | What changed |
|---|---|
| `useWorkspaceTerminalComposerActions.ts` | Removed `sendAgentChatMessage` branch from `sendPrompt`. Removed `setQueuedPrompts`, all chat session params, `sendChatInstruction`. Coordinator branch kept intentionally. |
| `WorkspaceTerminal.tsx` | Removed all chat session state, refs, effects, memos. Removed `AgentChatPanel` from JSX (~263 lines net deleted). Terminal now fills full height. |
| `WorkspaceComposer.tsx` | Removed `selectedClaudeAgent` from `ComposerSettings`. Draft key simplified from `${workspaceId}:${sessionId}` to `workspaceId`. Removed `CLAUDE_AGENT_OPTIONS`. |
| `WorkspaceComposerSettingsPopover.tsx` | Removed claude agent selector dropdown (was `--agent` flag, only applicable to `claude -p`). |
| `WorkspaceHeader.tsx` | Removed `chatSessions`, `focusedChatId`, `onCreateChatSession`, `onCloseChatSession`, `onAttachChatSession` props. "New Claude" button now calls `onCreateTerminal('agent', 'claude_code')`. Codex/Kimi/LocalLLM dropdown items updated to `onCreateTerminal` too. Chat session tab bar removed. |
| `useWorkspaceTerminalEvents.ts` | Removed `forge://agent-chat-event` listener. Removed all chat session/event params. |
| `useWorkspaceTerminalPolling.ts` | Removed `refreshChatSessions` from polling loop. `hasRunningSession` now checks only terminal sessions. |
| `useWorkspaceTerminalSessionActions.ts` | Removed `createChatSession`, `closeChatSession`. Simplified `interruptFocusedAgent` and `attachTerminal`. |

### Backend (Rust)

| File | What changed |
|---|---|
| `src-tauri/src/services/agent_chat_service.rs` | `create_agent_chat_session` now immediately returns an error for `claude_code` provider: `"Claude chat sessions are deprecated. Use the terminal session instead."` |

### What was intentionally kept

- **Coordinator mode** — uses `claude -p` via `coordinator_service.rs`. This is an opt-in power feature; the SDK credit usage is an accepted trade-off. No changes made.
- **Codex, Kimi, Local LLM** — unaffected. They use their own CLIs via terminal sessions.
- **All PTY infrastructure** — `terminal_service`, `portable-pty`, `queue.rs`, memory injection, context injection, output persistence — all untouched.
- **`agent_chat_service.rs`** — left in place (guarded, not deleted) to avoid breaking existing DB records. Phase 2 cleans it up.

---

## What's left

### Task 5 — Smoke test (required before merge)

```bash
cd /Users/jay/conductor/workspaces/forge/wellington
npm run tauri dev
```

Verify:
1. Workspace opens to a full-height xterm terminal — no chat panel visible
2. Type a prompt in the composer and send → appears in PTY, Claude responds interactively
3. While Claude is running: `ps aux | grep "claude -p"` returns nothing (only `claude`, no `-p` flag)
4. New Codex tab from the `⋯` menu still works
5. Model selector change takes effect on next PTY session (`ps aux` shows `claude --model <selected>`)

### Phase 2 — Cleanup (not urgent, after confirming stable)

These files are now dead code. Safe to delete once the app runs well for a week or two:

```
src-tauri/src/services/agent_chat_service.rs
src-tauri/src/repositories/agent_chat_repository.rs
src-tauri/src/models/agent_chat.rs
src-tauri/src/commands/agent_runs.rs
src-tauri/src/services/agent_process_service.rs
src/components/terminal/AgentChatPanel.tsx
```

Also add a DB migration to drop:
- `agent_chat_sessions` table
- `agent_chat_events` table

---

## Key files to know

| File | Purpose |
|---|---|
| `src-tauri/src/services/terminal_service.rs` | PTY session management — the safe path |
| `src-tauri/src/services/queue.rs` | Memory + context injection before PTY write |
| `src-tauri/src/services/coordinator_service.rs` | Coordinator brain calls — still uses `claude -p` intentionally |
| `src/components/terminal/WorkspaceTerminal.tsx` | Top-level workspace component |
| `src/components/terminal/useWorkspaceTerminalComposerActions.ts` | All send paths: coordinator branch + terminal PTY branch |
