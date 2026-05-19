import { Search, Plus, FolderPlus, Bot, ClipboardCheck, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReviewItem, Workspace } from '../../types';
import { PendingReviews } from '../reviews/PendingReviews';
import { WorkspaceCard } from './WorkspaceCard';
import { Button } from '../ui/button';

interface WorkspacesViewProps {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewWorkspace: () => void;
  pendingReviews: ReviewItem[];
  showPendingReviews?: boolean;
}

function QuickStartCard({ icon, title, description, onClick }: { icon: React.ReactNode, title: string, description: string, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-xl border border-mn-border bg-mn-card p-4 text-left transition-all hover:border-mn-cyan/40 hover:bg-mn-surface group"
    >
      <div className="mb-3 rounded-lg bg-mn-surface-overlay p-2 transition-colors group-hover:bg-mn-surface-overlay-high">
        {icon}
      </div>
      <h3 className="text-ui-body font-bold text-mn-text">{title}</h3>
      <p className="mt-1 text-ui-label text-mn-muted leading-relaxed">{description}</p>
    </button>
  );
}

export function WorkspacesView({
  workspaces,
  selectedId,
  onSelect,
  onNewWorkspace,
  pendingReviews,
  showPendingReviews = true,
}: WorkspacesViewProps) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current[selectedId]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedId]);

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isPendingCollapsed = collapsedSections.has('pending');
  const isWorkspacesCollapsed = collapsedSections.has('workspaces');

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-mn-bg">
      <div className="px-6 py-4 border-b border-mn-border bg-mn-surface/30 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-ui-title font-bold text-mn-text tracking-tight leading-none">Workspaces</h1>
          <p className="text-ui-caption text-mn-muted mt-1">
            Active agent sessions in your repositories
          </p>
        </div>
        <Button onClick={onNewWorkspace} size="sm" className="bg-mn-cyan hover:bg-mn-cyan-high text-white shadow-electric-glow">
          <Plus className="w-4 h-4 mr-1" />
          New Workspace
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="mb-6 rounded-full bg-mn-cyan/10 p-4">
              <Plus className="h-8 w-8 text-mn-cyan" />
            </div>
            <h2 className="text-ui-headline font-bold text-mn-text">Get started with Mnemonic</h2>
            <p className="mt-2 max-w-sm text-ui-body text-mn-muted">
              Mnemonic helps you orchestrate parallel AI coding sessions across your repositories.
            </p>
            
            <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
              <QuickStartCard 
                icon={<FolderPlus className="h-5 w-5 text-mn-cyan" />}
                title="Create Workspace"
                description="Start a new agent session on a branch or worktree."
                onClick={onNewWorkspace}
              />
              <QuickStartCard 
                icon={<Search className="h-5 w-5 text-mn-blue" />}
                title="Scan Repositories"
                description="Mnemonic automatically discovers git repos in your root paths."
                onClick={() => {}} 
              />
              <QuickStartCard 
                icon={<Bot className="h-5 w-5 text-mn-violet" />}
                title="Configure Agents"
                description="Set up Claude, Codex, Kimi, or local LLMs in Settings."
                onClick={() => {}} 
              />
            </div>
          </div>
        ) : (
          <>
            {showPendingReviews && pendingReviews.length > 0 && (
              <section className="space-y-4">
                <div 
                  className="flex items-center gap-2 px-1 cursor-pointer group"
                  onClick={() => toggleSection('pending')}
                >
                  <div className="text-mn-muted/40 group-hover:text-mn-muted/70 transition-colors">
                    {isPendingCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                  <ClipboardCheck className="h-4 w-4 text-mn-blue" />
                  <h2 className="text-ui-subhead font-bold text-mn-text uppercase tracking-wider">Pending Reviews</h2>
                  <span className="rounded-full bg-mn-blue/10 px-2 py-0.5 text-ui-caption font-bold text-mn-blue border border-mn-blue/20">
                    {pendingReviews.length}
                  </span>
                </div>
                {!isPendingCollapsed && (
                  <PendingReviews reviews={pendingReviews} onOpenWorkspace={onSelect} />
                )}
              </section>
            )}

            <section className="space-y-4 pb-10">
              <div 
                className="flex items-center gap-2 px-1 cursor-pointer group"
                onClick={() => toggleSection('workspaces')}
              >
                <div className="text-mn-muted/40 group-hover:text-mn-muted/70 transition-colors">
                  {isWorkspacesCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
                <LayoutGrid className="h-4 w-4 text-mn-cyan" />
                <h2 className="text-ui-subhead font-bold text-mn-text uppercase tracking-wider">All Workspaces</h2>
                <span className="text-ui-caption text-mn-muted/35">({workspaces.length})</span>
              </div>
              {!isWorkspacesCollapsed && (
                <div className="flex flex-col gap-2">
                  {workspaces.map((workspace) => (
                    <div
                      key={workspace.id}
                      ref={(el) => (cardRefs.current[workspace.id] = el)}
                    >
                      <WorkspaceCard
                        workspace={workspace}
                        isSelected={workspace.id === selectedId}
                        onSelect={() => onSelect(workspace.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
