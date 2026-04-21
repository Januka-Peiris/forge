import { useEffect } from 'react';
import type { Workspace } from '../../types';

interface UseAppKeyboardShortcutsInput {
  commandPaletteOpen: boolean;
  displayedWorkspaces: Workspace[];
  environmentModalOpen: boolean;
  modalOpen: boolean;
  selectedWorkspaceId: string | null;
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;
  onOpenReviews: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSetWorkspacesView: () => void;
  onToggleCommandPalette: () => void;
  onToggleDetailPanel: () => void;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function focusWorkspaceComposer(): void {
  window.dispatchEvent(new CustomEvent('forge:focus-composer'));
}

function toggleWorkspacePlanMode(): void {
  window.dispatchEvent(new CustomEvent('forge:toggle-plan-mode'));
}

export function useAppKeyboardShortcuts({
  commandPaletteOpen,
  displayedWorkspaces,
  environmentModalOpen,
  modalOpen,
  selectedWorkspaceId,
  shortcutsOpen,
  onCloseShortcuts,
  onOpenReviews,
  onSelectWorkspace,
  onSetWorkspacesView,
  onToggleCommandPalette,
  onToggleDetailPanel,
}: UseAppKeyboardShortcutsInput) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;
      const editableTarget = isEditableShortcutTarget(event.target);

      if (meta && key === 'k') {
        event.preventDefault();
        onToggleCommandPalette();
        return;
      }

      if (event.key === 'Escape' && shortcutsOpen) {
        event.preventDefault();
        onCloseShortcuts();
        return;
      }

      if (event.key === 'Escape' && editableTarget) {
        (event.target as HTMLElement).blur();
        return;
      }

      if (commandPaletteOpen || modalOpen || environmentModalOpen || shortcutsOpen) return;

      if (meta && event.key >= '1' && event.key <= '9' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const workspace = displayedWorkspaces[parseInt(event.key) - 1];
        if (workspace) {
          onSelectWorkspace(workspace.id);
          onSetWorkspacesView();
        }
        return;
      }

      if (meta && event.shiftKey && key === 'd') {
        event.preventDefault();
        onToggleDetailPanel();
        return;
      }

      if (meta && event.shiftKey && key === 'r') {
        if (!selectedWorkspaceId) return;
        event.preventDefault();
        onOpenReviews();
        return;
      }

      if (event.key === 'Tab' && event.shiftKey && !meta && !event.altKey) {
        if (editableTarget) return;
        if (!selectedWorkspaceId) return;
        event.preventDefault();
        onSetWorkspacesView();
        window.setTimeout(toggleWorkspacePlanMode, 0);
        return;
      }

      if (editableTarget || meta || event.altKey || event.shiftKey) return;

      if (event.key === '/') {
        if (!selectedWorkspaceId) return;
        event.preventDefault();
        onSetWorkspacesView();
        window.setTimeout(focusWorkspaceComposer, 0);
        return;
      }

      if (event.key === '[' || event.key === ']') {
        if (displayedWorkspaces.length === 0) return;
        event.preventDefault();
        const selectedIndex = displayedWorkspaces.findIndex((workspace) => workspace.id === selectedWorkspaceId);
        const fallbackIndex = event.key === '[' ? displayedWorkspaces.length : -1;
        const currentIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex;
        const delta = event.key === '[' ? -1 : 1;
        const nextIndex = (currentIndex + delta + displayedWorkspaces.length) % displayedWorkspaces.length;
        const nextWorkspace = displayedWorkspaces[nextIndex];
        if (nextWorkspace) {
          onSelectWorkspace(nextWorkspace.id);
          onSetWorkspacesView();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    commandPaletteOpen,
    displayedWorkspaces,
    environmentModalOpen,
    modalOpen,
    onCloseShortcuts,
    onOpenReviews,
    onSelectWorkspace,
    onSetWorkspacesView,
    onToggleCommandPalette,
    onToggleDetailPanel,
    selectedWorkspaceId,
    shortcutsOpen,
  ]);
}
