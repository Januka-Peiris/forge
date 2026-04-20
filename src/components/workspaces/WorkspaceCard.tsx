import { useMemo } from 'react';
import type { Workspace } from '../../types';
import { WorkspaceListItem } from './WorkspaceListItem';
import { ChevronRight } from 'lucide-react';

interface WorkspaceCardProps {
  workspace: Workspace;
  isSelected: boolean;
  onSelect: () => void;
}

export function WorkspaceCard({ workspace, isSelected, onSelect }: WorkspaceCardProps) {
  const [totalAdds, totalDels] = useMemo(() => [
    workspace.changedFiles.reduce((sum, file) => sum + file.additions, 0),
    workspace.changedFiles.reduce((sum, file) => sum + file.deletions, 0),
  ], [workspace.changedFiles]);

  return (
    <WorkspaceListItem
      workspace={workspace}
      isSelected={isSelected}
      onClick={onSelect}
      className="py-3 px-4"
      totalAdds={totalAdds}
      totalDels={totalDels}
      suffix={
        <ChevronRight
          className={`w-4 h-4 transition-all ${
            isSelected ? 'text-forge-green' : 'text-forge-muted opacity-0 group-hover:opacity-100'
          }`}
        />
      }
    />
  );
}
