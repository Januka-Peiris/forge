import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileCode, GitPullRequest, Play, Search, Terminal as TerminalIcon, Trash2, X, Zap } from 'lucide-react';
import type { AgentProfile, TerminalProfile, TerminalSession, Workspace, WorkspaceChangedFile, WorkspacePrComment, WorkspaceReadiness } from '../../types';
import { createWorkspaceTerminal, attachWorkspaceTerminalSession, listWorkspaceVisibleTerminalSessions } from '../../lib/tauri-api/terminal';
import { getWorkspaceReviewCockpit, refreshWorkspacePrComments, queueReviewAgentPrompt } from '../../lib/tauri-api/review-cockpit';
import { listWorkspaceAgentProfiles } from '../../lib/tauri-api/agent-profiles';
import { runWorkspaceSetup, startWorkspaceRunCommand, getWorkspaceForgeConfig } from '../../lib/tauri-api/workspace-scripts';
import { cleanupWorkspace } from '../../lib/tauri-api/workspace-cleanup';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { perfMark, perfMeasure } from '../../lib/perf';

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  icon: 'workspace' | 'file' | 'terminal' | 'comment' | 'agent' | 'action' | 'cleanup';
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
  const [activeIndex, setActiveIndex] = useState(0);
  const openPerfMarkRef = useRef<string | null>(null);

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
    const globalActionItems = [
      {
        id: 'action-check-environment',
        title: 'Check Environment',
        subtitle: 'Validate git, tmux, Codex, Claude, and GitHub CLI',
        keywords: 'environment setup dependencies git tmux codex claude gh check',
        icon: 'action' as const,
        run: onCheckEnvironment,
      },
    ];
    const actionItems = selectedWorkspace ? [
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
        keywords: 'cleanup stop teardown ports delete worktree',
        icon: 'cleanup' as const,
        run: async () => { paletteCache.delete(selectedWorkspace.id); await cleanupWorkspace({ workspaceId: selectedWorkspace.id, killPorts: false, removeManagedWorktree: false }); onOpenWorkspace(); },
      },
    ] : [];
    return [...globalActionItems, ...agentItems, ...actionItems, ...workspaceItems, ...fileItems, ...terminalItems, ...commentItems];
  }, [agentProfiles, changedFiles, comments, onCheckEnvironment, onOpenReviewComment, onOpenReviewFile, onOpenWorkspace, onSelectWorkspace, paletteChangedFiles, readiness, runCommands, selectedWorkspace, sessions, workspaces]);

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
            placeholder="Jump to workspace, file, agent session, or PR comment…"
            className="flex-1 bg-transparent text-[14px] text-forge-text outline-none placeholder:text-forge-muted"
          />
          <button onClick={onClose} className="rounded-md p-1 text-forge-muted hover:bg-white/5 hover:text-forge-text"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-[12px] text-forge-muted">No matching commands.</p>
          ) : filtered.map((item, index) => (
            <button
              key={item.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { void item.run(); onClose(); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === activeIndex ? 'bg-forge-orange/10' : 'hover:bg-white/5'}`}
            >
              <CommandIcon icon={item.icon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-forge-text">{item.title}</span>
                <span className="block truncate text-[11px] text-forge-muted">{item.subtitle}</span>
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
  if (icon === 'workspace') return <Zap className={`${cls} text-forge-orange`} />;
  if (icon === 'file') return <FileCode className={`${cls} text-forge-green`} />;
  if (icon === 'terminal') return <TerminalIcon className={`${cls} text-forge-blue`} />;
  if (icon === 'comment') return <GitPullRequest className={`${cls} text-forge-violet`} />;
  if (icon === 'action') return <Play className={`${cls} text-forge-green`} />;
  if (icon === 'cleanup') return <Trash2 className={`${cls} text-forge-red`} />;
  return <Bot className={`${cls} text-forge-orange`} />;
}

function firstLine(value: string) {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
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
