import { Search, Plus, FolderPlus, Bot, ClipboardCheck, LayoutGrid } from 'lucide-react';
import { useEffect, useRef } from 'react';
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
      className="flex flex-col items-start rounded-xl border border-forge-border bg-forge-card p-4 text-left transition-all hover:border-forge-green/40 hover:bg-forge-surface group"
    >
      <div className="mb-3 rounded-lg bg-forge-surface-overlay p-2 transition-colors group-hover:bg-forge-surface-overlay-high">
        {icon}
      </div>
      <h3 className="text-ui-body font-bold text-forge-text">{title}</h3>
      <p className="mt-1 text-ui-label text-forge-muted leading-relaxed">{description}</p>
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

  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current[selectedId]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedId]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-forge-bg">
      <div className="px-6 py-4 border-b border-forge-border bg-forge-surface/30 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-ui-title font-bold text-forge-text tracking-tight leading-none">Workspaces</h1>
          <p className="text-ui-caption text-forge-muted mt-1">
            Active agent sessions in your repositories
          </p>
        </div>
        <Button onClick={onNewWorkspace} size="sm" className="bg-forge-green hover:bg-forge-green-high text-white shadow-electric-glow">
          <Plus className="w-4 h-4 mr-1" />
          New Workspace
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="mb-6 rounded-full bg-forge-green/10 p-4">
              <Plus className="h-8 w-8 text-forge-green" />
            </div>
            <h2 className="text-ui-headline font-bold text-forge-text">Get started with Forge</h2>
            <p className="mt-2 max-w-sm text-ui-body text-forge-muted">
              Forge helps you orchestrate parallel AI coding sessions across your repositories.
            </p>
            
            <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
              <QuickStartCard 
                icon={<FolderPlus className="h-5 w-5 text-forge-green" />}
                title="Create Workspace"
                description="Start a new agent session on a branch or worktree."
                onClick={onNewWorkspace}
              />
              <QuickStartCard 
                icon={<Search className="h-5 w-5 text-forge-blue" />}
                title="Scan Repositories"
                description="Forge automatically discovers git repos in your root paths."
                onClick={() => {}} 
              />
              <QuickStartCard 
                icon={<Bot className="h-5 w-5 text-forge-violet" />}
                title="Configure Agents"
                description="Set up Claude, Codex, or local LLMs in Settings."
                onClick={() => {}} 
              />
            </div>
          </div>
        ) : (
          <>
            {showPendingReviews && pendingReviews.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <ClipboardCheck className="h-4 w-4 text-forge-blue" />
                  <h2 className="text-ui-subhead font-bold text-forge-text uppercase tracking-wider">Pending Reviews</h2>
                  <span className="rounded-full bg-forge-blue/10 px-2 py-0.5 text-ui-caption font-bold text-forge-blue border border-forge-blue/20">
                    {pendingReviews.length}
                  </span>
                </div>
                <PendingReviews reviews={pendingReviews} onOpenWorkspace={onSelect} />
              </section>
            )}

            <section className="space-y-4 pb-10">
              <div className="flex items-center gap-2 px-1">
                <LayoutGrid className="h-4 w-4 text-forge-green" />
                <h2 className="text-ui-subhead font-bold text-forge-text uppercase tracking-wider">All Workspaces</h2>
              </div>
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
            </section>
          </>
        )}
      </div>
    </div>
  );
}
