import { ArrowDown, ArrowUp, AlertTriangle, Clock, Link2, Plus } from 'lucide-react';
import type { Workspace } from '../../types';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspaceHookInspector } from '../../types/workspace-hooks';
import type { LinkedWorktreeRef } from '../../types';
import { ContextPreviewPanel } from '../context/ContextPreviewPanel';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';
import { WorkspaceConfigDepthPanel } from './DetailPanelInsightsSections';

interface AttachOptionGroup {
  repoId: string;
  repoName: string;
  worktrees: Array<{
    id: string;
    branch?: string | null;
    path: string;
  }>;
}

interface DetailPanelConfigTabProps {
  workspace: Workspace;
  riskColor: string | undefined;
  budgetInput: string;
  onBudgetInputChange: (value: string) => void;
  onBudgetInputCommit: () => void;
  forgeConfig: ForgeWorkspaceConfig | null;
  workspaceHookInspector: WorkspaceHookInspector | null;
  linkedSearch: string;
  onLinkedSearchChange: (value: string) => void;
  selectedLinkedWorktreeId: string;
  onSelectedLinkedWorktreeIdChange: (value: string) => void;
  groupedAttachOptions: AttachOptionGroup[];
  onAttachLinkedWorktree?: (worktreeId: string) => void;
  linkedWorktrees: LinkedWorktreeRef[];
  onOpenLinkedWorktreeInCursor?: (path: string) => void;
  onDetachLinkedWorktree?: (worktreeId: string) => void;
  onCreateChildWorkspace?: () => void;
}

export function DetailPanelConfigTab({
  workspace,
  riskColor,
  budgetInput,
  onBudgetInputChange,
  onBudgetInputCommit,
  forgeConfig,
  workspaceHookInspector,
  linkedSearch,
  onLinkedSearchChange,
  selectedLinkedWorktreeId,
  onSelectedLinkedWorktreeIdChange,
  groupedAttachOptions,
  onAttachLinkedWorktree,
  linkedWorktrees,
  onOpenLinkedWorktreeInCursor,
  onDetachLinkedWorktree,
  onCreateChildWorkspace,
}: DetailPanelConfigTabProps) {
  return (
    <>
      <div className="px-4 py-4">
        <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-3">Branch Health</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
            <div className="flex items-center justify-center gap-1 text-forge-green mb-1">
              <ArrowUp className="w-3 h-3" />
              <span className="text-xs text-forge-muted">Ahead</span>
            </div>
            <p className="text-lg font-bold text-forge-text">{workspace.aheadBy}</p>
          </div>
          <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
            <div className="flex items-center justify-center gap-1 text-forge-yellow mb-1">
              <ArrowDown className="w-3 h-3" />
              <span className="text-xs text-forge-muted">Behind</span>
            </div>
            <p className="text-lg font-bold text-forge-text">{workspace.behindBy}</p>
          </div>
          <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="w-3 h-3 text-forge-muted" />
              <span className="text-xs text-forge-muted">Risk</span>
            </div>
            <p className={`text-sm font-bold ${riskColor}`}>{workspace.mergeRisk}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-forge-muted">
          <Clock className="w-3 h-3 shrink-0" />
          <span>Last rebase: {workspace.lastRebase}</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Budget Cap</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={budgetInput}
            onChange={(event) => onBudgetInputChange(event.target.value)}
            onBlur={onBudgetInputCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onBudgetInputCommit();
            }}
            placeholder={workspace.costLimitUsd ? `$${workspace.costLimitUsd.toFixed(2)}` : 'No cap'}
            className="flex-1"
          />
          <span className="text-xs text-forge-muted shrink-0">USD</span>
        </div>
      </div>

      <div className="mx-4 pb-4">
        <ContextPreviewPanel workspaceId={workspace.id} />
      </div>

      <WorkspaceConfigDepthPanel config={forgeConfig} />

      <div className="px-4 pb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-forge-muted">Hook & Guardrail Inspector</p>
        <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
          {!workspaceHookInspector ? (
            <p className="text-xs text-forge-muted">Hook inspector unavailable.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                <div className="rounded-lg bg-black/10 px-2.5 py-1.5">
                  <p className="text-forge-muted">Configured hooks</p>
                  <p className="font-semibold text-forge-text">{workspaceHookInspector.commands.length}</p>
                </div>
                <div className="rounded-lg bg-black/10 px-2.5 py-1.5">
                  <p className="text-forge-muted">Risky scripts policy</p>
                  <p className="font-semibold text-forge-text">{workspaceHookInspector.riskyScriptsEnabled ? 'Enabled' : 'Blocked by default'}</p>
                </div>
                <div className="rounded-lg bg-black/10 px-2.5 py-1.5">
                  <p className="text-forge-muted">Recent hook events</p>
                  <p className="font-semibold text-forge-text">{workspaceHookInspector.recentEvents.length}</p>
                </div>
              </div>

              {workspaceHookInspector.configPath && (
                <p className="mt-2 truncate text-xs text-forge-muted">Config: {workspaceHookInspector.configPath}</p>
              )}

              {workspaceHookInspector.commands.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-forge-border p-4 text-xs text-forge-muted">
                  No hooks configured in `.forge/config.json`.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {workspaceHookInspector.commands.map((command) => (
                    <div key={command.id} className="rounded-lg border border-forge-border/60 bg-black/10 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-forge-text">{command.label}</span>
                        <span className="rounded border border-forge-border px-1.5 py-0.5 text-[11px] text-forge-muted">
                          {command.hookKind} · {command.phase}
                        </span>
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${
                          command.safety.safetyLevel === 'risky' || command.safety.safetyLevel === 'blocked'
                            ? 'border-forge-red/20 bg-forge-red/10 text-forge-red'
                            : command.safety.safetyLevel === 'informational'
                              ? 'border-forge-yellow/20 bg-forge-yellow/10 text-forge-yellow'
                              : 'border-forge-green/20 bg-forge-green/10 text-forge-green'
                        }`}>
                          {command.safety.safetyLevel}
                        </span>
                        {command.willBlockWhenRisky && (
                          <span className="rounded border border-forge-red/20 bg-forge-red/10 px-1.5 py-0.5 text-[11px] text-forge-red">
                            blocked unless risky scripts enabled
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-forge-text/85">{command.command}</p>
                      <p className="mt-1 text-[11px] text-forge-muted">{command.safety.explanation}</p>
                      {command.safety.risks.length > 0 && (
                        <p className="mt-1 text-[11px] text-forge-muted">Risks: {command.safety.risks.join(' · ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {workspaceHookInspector.recentEvents.length > 0 && (
                <div className="mt-3 rounded-lg border border-forge-border/60 bg-black/10 p-2">
                  <p className="text-xs font-semibold text-forge-text/85">Recent hook / guardrail results</p>
                  <div className="mt-2 space-y-1">
                    {workspaceHookInspector.recentEvents.slice(0, 6).map((event) => (
                      <div key={event.id} className="rounded border border-forge-border/50 bg-black/15 px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-forge-text/85">{event.label ?? event.event}</span>
                          <span className="shrink-0 text-forge-muted">{event.timestamp}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-forge-muted">
                          {event.category} · {event.status}
                          {event.detail ? ` · ${event.detail}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Linked Worktrees</p>
        <Input
          value={linkedSearch}
          onChange={(event) => onLinkedSearchChange(event.target.value)}
          placeholder="Search repos/worktrees..."
          className="mb-2"
        />
        <div className="flex gap-2 mb-2">
          <Select value={selectedLinkedWorktreeId} onValueChange={onSelectedLinkedWorktreeIdChange}>
            <SelectTrigger compact className="flex-1 min-w-0">
              <SelectValue placeholder="Select worktree to attach" />
            </SelectTrigger>
            <SelectContent>
              {groupedAttachOptions.length === 0 && (
                <SelectItem value="" disabled>No worktrees available</SelectItem>
              )}
              {groupedAttachOptions.map((group) => (
                <SelectGroup key={group.repoId}>
                  <SelectLabel>{group.repoName}</SelectLabel>
                  {group.worktrees.map((worktree) => (
                    <SelectItem key={worktree.id} value={worktree.id}>
                      {worktree.branch ?? 'detached'} · {worktree.path}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectedLinkedWorktreeId && onAttachLinkedWorktree?.(selectedLinkedWorktreeId)}
          >
            Attach
          </Button>
        </div>
        {linkedWorktrees.length === 0 ? (
          <p className="text-xs text-forge-muted leading-relaxed">No linked worktrees. Attach a worktree from another repo for supporting context.</p>
        ) : (
          <div className="space-y-1.5">
            {linkedWorktrees.map((linked) => (
              <div key={linked.worktreeId} className="rounded border border-forge-border/60 bg-forge-card/60 px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-xs text-forge-text">
                  <Link2 className="w-3 h-3 text-forge-blue" />
                  <span className="font-semibold">{linked.repoName}</span>
                  <span className="font-mono text-forge-text/85">{linked.branch ?? 'detached'}</span>
                </div>
                <p className="mt-1 text-xs font-mono text-forge-muted truncate">{linked.path}</p>
                <div className="mt-1 flex gap-2">
                  <button onClick={() => onOpenLinkedWorktreeInCursor?.(linked.path)} className="text-xs text-forge-blue hover:underline">Open in Cursor</button>
                  <button onClick={() => onDetachLinkedWorktree?.(linked.worktreeId)} className="text-xs text-forge-red hover:underline">Detach</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Lineage</p>
          <Button variant="secondary" size="xs" onClick={onCreateChildWorkspace}>
            <Plus className="w-3 h-3" /> Branch From Here
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-forge-muted">Parent: <span className="font-mono text-forge-text">{workspace.parentWorkspaceId ?? 'none'}</span></p>
          <p className="text-xs text-forge-muted">Source: <span className="font-mono text-forge-text">{workspace.sourceWorkspaceId ?? 'self'}</span></p>
          <p className="text-xs text-forge-muted">Derived: <span className="font-mono text-forge-text">{workspace.derivedFromBranch ?? workspace.branch}</span></p>
        </div>
      </div>
    </>
  );
}
