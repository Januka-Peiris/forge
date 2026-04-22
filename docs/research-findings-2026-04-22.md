# Forge Research Findings (Latest as of April 22, 2026)

This document captures the latest synthesis from reviewing the deep-dive notes in:

- `.research/claude-code-deep-dive/`

Reviewed focus areas included hook/event systems, coordinator/task orchestration, context compaction, session recovery, notifications, memory, scheduling, sandbox/security, and error handling.

## Prioritized Adoption Tracker

| Priority | Theme | Recommendation | Rationale | Effort | Risk | Owner | Status |
|---|---|---|---|---|---|---|---|
| Now | Coordinator + profile rationalization | Remove generic built-in coding profiles, require explicit configured coordinator profiles, add explicit OpenAI profile support | Reduces hidden defaults, makes behavior predictable, aligns selection with real configured agents | M | M | Forge | Done |
| Now | Findings visibility | Keep a dated research findings doc and link it from implementation status | Makes roadmap and decision history auditable and trackable | S | L | Forge | Done |
| Next | Hook/event pipeline | Add configurable lifecycle hooks (pre/post tool/run/ship) with clear allow/block semantics | Improves policy enforcement and extensibility without cloud coupling | M-L | M | Forge | Done |
| Next | Notification routing | Add notification priority, dedupe/fold, and background vs foreground routing rules | Improves signal quality and reduces noise in active multi-workspace sessions | M | M | Forge | Done |
| Next | Session recovery deepening | Add richer interrupted-turn recovery semantics and clearer continuation behavior | Improves trust in long-running sessions and restart safety | M | M | Forge | Done |
| Later | Unified task model | Unify run/chat/coordinator/background units under one task lifecycle model | Simplifies lifecycle handling and cross-surface observability | L | M-H | Forge | Done |
| Later | Memory v2 | Add lightweight automatic memory extraction + selective recall | Better long-session continuity without heavyweight cloud features | L | M | Forge | Done |
| Later | Scheduler evolution | Expand orchestrator scheduling to per-workspace durable schedules/jitter/locks | Enables safer automation and scalable background coordination | M-L | M | Forge | Done |
| Reject for now | Companion/voice novelty | Do not prioritize buddy/voice-style features | Low leverage for core conductor value and reliability path | S | L | Forge | Deferred |
| Reject for now | Full marketplace/plugin parity | Do not replicate full plugin marketplace complexity now | High complexity, lower near-term value vs reliability/orchestration improvements | L | M-H | Forge | Deferred |

## Notes

- This is the latest snapshot as of **April 22, 2026**.
- Scope intentionally stays local-first and Forge-config driven.
- External profile file parsing (`.claude` / `.codex`) remains out of this slice.
- Remaining items from this research pass are intentionally deferred:
  - companion/voice novelty
  - full marketplace/plugin parity
