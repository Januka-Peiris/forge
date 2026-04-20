import type { Workspace } from '../../types';
import { WorkspaceListItem } from './WorkspaceListItem';
import { ChevronRight } from 'lucide-react';

interface WorkspaceCardProps {
  workspace: Workspace;
  isSelected: boolean;
  onSelect: () => void;
}

export function WorkspaceCard({ workspace, isSelected, onSelect }: WorkspaceCardProps) {
  return (
    <WorkspaceListItem
      workspace={workspace}
      isSelected={isSelected}
      onClick={onSelect}
      className="py-3 px-4"
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
