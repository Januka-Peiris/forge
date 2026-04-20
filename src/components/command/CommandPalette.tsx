import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileCode, GitPullRequest, Play, Search, ShieldCheck, Ship, Terminal as TerminalIcon, Trash2, X, Zap } from 'lucide-react';
import type { AgentProfile, TerminalProfile, TerminalSession, Workspace, WorkspaceChangedFile, WorkspacePrComment, WorkspaceReadiness } from '../../types';
import type { TerminalSearchResult } from '../../types/terminal';
import { createWorkspaceTerminal, attachWorkspaceTerminalSession, listWorkspaceVisibleTerminalSessions, searchTerminalOutput, queueWorkspaceAgentPrompt } from '../../lib/tauri-api/terminal';
import { getWorkspaceReviewCockpit, refreshWorkspacePrComments, queueReviewAgentPrompt } from '../../lib/tauri-api/review-cockpit';
import { listWorkspaceAgentProfiles } from '../../lib/tauri-api/agent-profiles';
import { runWorkspaceSetup, startWorkspaceRunCommand, getWorkspaceForgeConfig } from '../../lib/tauri-api/workspace-scripts';
import { cleanupWorkspace } from '../../lib/tauri-api/workspace-cleanup';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { createWorkspaceCheckpoint } from '../../lib/tauri-api/checkpoints';
import { perfMark, perfMeasure } from '../../lib/perf';

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  icon: 'workspace' | 'file' | 'terminal' | 'comment' | 'agent' | 'action' | 'cleanup' | 'checkpoint' | 'ship';
  run: () => void | Promise<void>;
};


interface PaletteCacheEntry {
  expiresAt: number;
  sessions: TerminalSession[];
  comments: WorkspacePrComment[];
  agentProfiles: AgentProfile[];
  readiness: WorkspaceReadiness | null;
  runCommands: string[];
  changedFiles: WorkspaceChangedFile[];
}

const PALETTE_CACHE_TTL_MS = 8_000;
const paletteCache = new Map<string, PaletteCacheEntry>();

interface CommandPaletteProps {
  open: boolean;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  changedFiles: WorkspaceChangedFile[];
  onClose: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenWorkspace: () => void;
  onOpenReviewFile: (path: string) => void;
  onOpenReviewComment: (commentId: string, path?: string | null) => void;
  onCheckEnvironment: () => void | Promise<void>;
}

export function CommandPalette({ open, workspaces, selectedWorkspace, changedFiles, onClose, onSelectWorkspace, onOpenWorkspace, onOpenReviewFile, onOpenReviewComment, onCheckEnvironment }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [comments, setComments] = useState<WorkspacePrComment[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [readiness, setReadiness] = useState<WorkspaceReadiness | null>(null);
  const [runCommands, setRunCommands] = useState<string[]>([]);
  const [paletteChangedFiles, setPaletteChangedFiles] = useState<WorkspaceChangedFile[]>([]);
  const [terminalSearchResults, setTerminalSearchResults] = useState<TerminalSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const openPerfMarkRef = useRef<string | null>(null);
  const terminalSearchTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const mark = `forge:command-palette-open:${Date.now()}`;
    openPerfMarkRef.current = mark;
    perfMark(mark);
    setQuery('');
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedWorkspace) {
      setSessions([]);
      setComments([]);
      setAgentProfiles([]);
      setReadiness(null);
      setRunCommands([]);
      setPaletteChangedFiles([]);
      return;
    }
    let cancelled = false;
    const workspaceId = selectedWorkspace.id;
    const cached = paletteCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      setSessions(cached.sessions);
      setComments(cached.comments);
      setAgentProfiles(cached.agentProfiles);
      setReadiness(cached.readiness);
      setRunCommands(cached.runCommands);
      setPaletteChangedFiles(cached.changedFiles);
      return;
    }
    void Promise.all([
      listWorkspaceVisibleTerminalSessions(workspaceId).catch(() => []),
      getWorkspaceReviewCockpit(workspaceId, null).then((cockpit) => ({ comments: cockpit.prComments, files: cockpit.files.map((item) => item.file) })).catch(() => ({ comments: [] as WorkspacePrComment[], files: [] as WorkspaceChangedFile[] })),
      listWorkspaceAgentProfiles(workspaceId).catch(() => []),
      getWorkspaceReadiness(workspaceId).catch(() => null),
      getWorkspaceForgeConfig(workspaceId).then((config) => config.run).catch(() => []),
    ]).then(([nextSessions, cockpitData, nextProfiles, nextReadiness, nextRunCommands]) => {
      if (cancelled) return;
      const entry = {
        expiresAt: Date.now() + PALETTE_CACHE_TTL_MS,
        sessions: nextSessions,
        comments: cockpitData.comments,
        agentProfiles: nextProfiles,
        readiness: nextReadiness,
        runCommands: nextRunCommands,
        changedFiles: cockpitData.files,
      };
      paletteCache.set(workspaceId, entry);
      setSessions(entry.sessions);
      setComments(entry.comments);
      setAgentProfiles(entry.agentProfiles);
      setReadiness(entry.readiness);
      setRunCommands(entry.runCommands);
      setPaletteChangedFiles(entry.changedFiles);
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedWorkspace]);

  useEffect(() => {
    if (!open) { setTerminalSearchResults([]); return; }
    const isSearchMode = query.startsWith('>');
    if (!isSearchMode) { setTerminalSearchResults([]); return; }
    const searchQuery = query.slice(1).trim();
    if (!searchQuery) { setTerminalSearchResults([]); return; }
    if (terminalSearchTimerRef.current !== undefined) window.clearTimeout(terminalSearchTimerRef.current);
    terminalSearchTimerRef.current = window.setTimeout(() => {
      searchTerminalOutput(searchQuery, selectedWorkspace?.id)
        .then(setTerminalSearchResults)
        .catch(() => undefined);
    }, 300);
    return () => {
      if (terminalSearchTimerRef.current !== undefined) window.clearTimeout(terminalSearchTimerRef.current);
    };
  }, [open, query, selectedWorkspace?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  const items = useMemo<CommandItem[]>(() => {
    // Terminal search mode: show only search results
    if (query.startsWith('>') && terminalSearchResults.length > 0) {
      return terminalSearchResults.map((result, index) => ({
        id: `tsearch-${index}`,
        title: stripAnsi(result.line).trim().slice(0, 120) || result.line.trim().slice(0, 120),
        subtitle: `Terminal search · ${result.workspaceName} · ${result.timestamp}`,
        keywords: result.line,
        icon: 'terminal' as const,
        run: () => {
          onSelectWorkspace(result.workspaceId);
          onOpenWorkspace();
        },
      }));
    }
    const selectedId = selectedWorkspace?.id;
    const availableChangedFiles = paletteChangedFiles.length > 0 ? paletteChangedFiles : changedFiles;
    const workspaceItems = workspaces.map((workspace) => ({
      id: `workspace-${workspace.id}`,
      title: workspace.name,
      subtitle: `Workspace · ${workspace.repo} / ${workspace.branch}${workspace.id === selectedWorkspace?.id && readiness ? ` · ${readiness.summary}` : ''}`,
      keywords: `${workspace.name} ${workspace.repo} ${workspace.branch}`,
      icon: 'workspace' as const,
      run: () => {
        onSelectWorkspace(workspace.id);
        onOpenWorkspace();
      },
    }));
    const fileItems = selectedId ? availableChangedFiles.map((file) => ({
      id: `file-${file.path}`,
      title: file.path,
      subtitle: `Changed file · ${file.status} · +${file.additions ?? 0} -${file.deletions ?? 0}`,
      keywords: `${file.path} ${file.status}`,
      icon: 'file' as const,
      run: () => onOpenReviewFile(file.path),
    })) : [];
    const terminalItems = selectedWorkspace ? sessions.map((session) => ({
      id: `session-${session.id}`,
      title: session.title || session.profile,
      subtitle: `Terminal · ${session.terminalKind} · ${session.status}`,
      keywords: `${session.title} ${session.profile} ${session.terminalKind} ${session.status}`,
      icon: 'terminal' as const,
      run: async () => {
        if (session.status === 'running') await attachWorkspaceTerminalSession({ workspaceId: selectedWorkspace.id, sessionId: session.id }).catch(() => undefined);
        onOpenWorkspace();
      },
    })) : [];
    const commentItems = comments.map((comment) => ({
      id: `comment-${comment.commentId}`,
      title: `${comment.author}: ${firstLine(comment.body)}`,
      subtitle: `PR comment · ${comment.path ?? 'general'}${comment.line ? `:${comment.line}` : ''}`,
      keywords: `${comment.author} ${comment.body} ${comment.path ?? ''}`,
      icon: 'comment' as const,
      run: () => onOpenReviewComment(comment.commentId, comment.path),
    }));
    const agentItems = selectedWorkspace ? agentProfiles.map((profile) => agentItem(selectedWorkspace.id, profile, onOpenWorkspace)) : [];
    
    // Direct agent prompt mode
    const directPromptItem = selectedWorkspace && query.startsWith('@') ? [{
      id: 'action-direct-prompt',
      title: `Tell Agent: ${query.slice(1).trim() || '...'}`,
      subtitle: `Direct instruction · ${selectedWorkspace.name}`,
      keywords: 'tell agent ask prompt instruction chat',
      icon: 'agent' as const,
      run: async () => {
        const prompt = query.slice(1).trim();
        if (prompt) {
          await queueWorkspaceAgentPrompt({ workspaceId: selectedWorkspace.id, prompt, mode: 'send_now' });
          onOpenWorkspace();
        }
      }
    }] : [];

    const globalActionItems = [
      {
        id: 'action-check-environment',
        title: 'Check Environment',
        subtitle: 'Validate git, tmux, Codex, Claude, local LLM, and GitHub CLI',
        keywords: 'environment setup dependencies git tmux codex claude ollama local llm gh check',
        icon: 'action' as const,
        run: onCheckEnvironment,
      },
    ];
    const actionItems = selectedWorkspace ? [
      {
        id: 'action-create-checkpoint',
        title: 'Create Checkpoint',
        subtitle: 'Safe Iteration · Manual git-backed snap',
        keywords: 'checkpoint snap safe backup save git',
        icon: 'checkpoint' as const,
        run: async () => { await createWorkspaceCheckpoint(selectedWorkspace.id, 'Manual checkpoint from palette'); onOpenWorkspace(); },
      },
      {
        id: 'action-ship-flow',
        title: 'Ship changes',
        subtitle: 'Readiness · Review, checks, PR, and cleanup',
        keywords: 'ship pr flow release readiness',
        icon: 'ship' as const,
        run: onOpenWorkspace, // Navigating to cockpit is the best proxy for now
      },
      {
        id: 'action-run-setup',
        title: 'Run setup',
        subtitle: 'Workspace command · .forge/config.json setup',
        keywords: 'setup install workspace command',
        icon: 'action' as const,
        run: async () => { paletteCache.delete(selectedWorkspace.id); await runWorkspaceSetup(selectedWorkspace.id); onOpenWorkspace(); },
      },
      ...runCommands.map((command, index) => ({
        id: `action-run-${index}`,
        title: `Run: ${command}`,
        subtitle: 'Workspace command · run terminal',
        keywords: `run dev command ${command}`,
        icon: 'action' as const,
        run: async () => { paletteCache.delete(selectedWorkspace.id); await startWorkspaceRunCommand(selectedWorkspace.id, index); onOpenWorkspace(); },
      })),
      {
        id: 'action-fetch-pr-comments',
        title: 'Fetch PR comments',
        subtitle: 'Review · GitHub/Greptile/team comments',
        keywords: 'github pr comments greptile review fetch',
        icon: 'comment' as const,
        run: async () => { paletteCache.delete(selectedWorkspace.id); await refreshWorkspacePrComments(selectedWorkspace.id); onOpenReviewComment('', null); },
      },
      {
        id: 'action-send-selected-diff',
        title: 'Send selected diff to agent',
        subtitle: 'Review · explain/fix current file',
        keywords: 'send diff agent fix explain review',
        icon: 'agent' as const,
        run: async () => { const file = availableChangedFiles[0]; if (file) await queueReviewAgentPrompt({ workspaceId: selectedWorkspace.id, path: file.path, action: 'fix_file', mode: 'send_now' }); },
      },
      {
        id: 'action-cleanup',
        title: 'Cleanup workspace',
        subtitle: 'Stop sessions, run teardown, scan ports',
        keywords: 'cleanup stop teardown ports safe',
        icon: 'cleanup' as const,
        run: async () => { paletteCache.delete(selectedWorkspace.id); await cleanupWorkspace({ workspaceId: selectedWorkspace.id, killPorts: false, removeManagedWorktree: false }); onOpenWorkspace(); },
      },
    ] : [];
    return [...directPromptItem, ...globalActionItems, ...agentItems, ...actionItems, ...workspaceItems, ...fileItems, ...terminalItems, ...commentItems];
  }, [agentProfiles, changedFiles, comments, onCheckEnvironment, onOpenReviewComment, onOpenReviewFile, onOpenWorkspace, onSelectWorkspace, paletteChangedFiles, query, readiness, runCommands, selectedWorkspace, sessions, terminalSearchResults, workspaces]);

  useEffect(() => {
    if (!open || !openPerfMarkRef.current) return;
    perfMeasure('command-palette:open', openPerfMarkRef.current);
    openPerfMarkRef.current = null;
  }, [open, items.length]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return items
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
      .slice(0, 40);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;
  const active = filtered[Math.min(activeIndex, Math.max(0, filtered.length - 1))];
  const runActive = async () => {
    if (!active) return;
    await active.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-forge-border bg-forge-surface shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-forge-border px-4 py-3">
          <Search className="h-4 w-4 text-forge-muted" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
              if (event.key === 'Enter') { event.preventDefault(); void runActive(); }
            }}
            placeholder="Jump to workspace, file, agent session… or type > to search terminal output"
            className="flex-1 bg-transparent text-ui-body text-forge-text outline-none placeholder:text-forge-muted"
          />
          <button onClick={onClose} className="rounded-md p-1 text-forge-muted hover:bg-forge-surface-overlay hover:text-forge-text"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-ui-label text-forge-muted">No matching commands.</p>
          ) : filtered.map((item, index) => (
            <button
              key={item.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { void item.run(); onClose(); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === activeIndex ? 'bg-forge-green/10' : 'hover:bg-forge-surface-overlay'}`}
            >
              <CommandIcon icon={item.icon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui-body font-semibold text-forge-text">{item.title}</span>
                <span className="block truncate text-ui-label text-forge-muted">{item.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function agentItem(workspaceId: string, profile: AgentProfile, onOpenWorkspace: () => void): CommandItem {
  return {
    id: `agent-${profile.id}`,
    title: profile.agent === 'shell' ? 'New Shell' : `Start ${profile.label}`,
    subtitle: `${profile.agent} · ${profile.mode ?? 'act'}${profile.reasoning ? ` · ${profile.reasoning}` : ''}`,
    keywords: `${profile.label} ${profile.id} ${profile.agent} ${profile.mode ?? ''} ${profile.reasoning ?? ''}`,
    icon: profile.agent === 'shell' ? 'terminal' : 'agent',
    run: async () => {
      await createWorkspaceTerminal({ workspaceId, kind: profile.agent === 'shell' ? 'shell' : 'agent', profile: profile.agent as TerminalProfile, profileId: profile.id, title: profile.agent === 'shell' ? 'Shell' : profile.label });
      onOpenWorkspace();
    },
  };
}

function CommandIcon({ icon }: { icon: CommandItem['icon'] }) {
  const cls = 'h-4 w-4 shrink-0';
  if (icon === 'workspace') return <Zap className={`${cls} text-forge-green`} />;
  if (icon === 'file') return <FileCode className={`${cls} text-forge-green`} />;
  if (icon === 'terminal') return <TerminalIcon className={`${cls} text-forge-blue`} />;
  if (icon === 'comment') return <GitPullRequest className={`${cls} text-forge-violet`} />;
  if (icon === 'action') return <Play className={`${cls} text-forge-green`} />;
  if (icon === 'checkpoint') return <ShieldCheck className={`${cls} text-forge-blue`} />;
  if (icon === 'ship') return <Ship className={`${cls} text-forge-green`} />;
  if (icon === 'cleanup') return <Trash2 className={`${cls} text-forge-red`} />;
  return <Bot className={`${cls} text-forge-green`} />;
}

function firstLine(value: string) {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function stripAnsi(value: string): string {
  return value
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, 'g'), '')
    .replace(new RegExp(`${String.fromCharCode(27)}[^m]*`, 'g'), '');
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreItem(item: CommandItem, query: string) {
  if (!query) return 1;
  const haystack = normalize(`${item.title} ${item.subtitle} ${item.keywords}`);
  if (haystack.includes(query)) return 100 - haystack.indexOf(query);
  let pos = 0;
  for (const ch of query) {
    const found = haystack.indexOf(ch, pos);
    if (found < 0) return -1;
    pos = found + 1;
  }
  return 10;
}
