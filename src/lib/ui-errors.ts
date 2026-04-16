function text(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'Unknown error');
}

export function formatSessionError(err: unknown): string {
  const raw = text(err);
  const lower = raw.toLowerCase();

  if (
    (lower.includes('failed to start codex') || lower.includes(' codex ') || lower.includes('start codex'))
    && (lower.includes("no such file") || lower.includes("not found") || lower.includes("enoent"))
  ) {
    return 'Codex CLI was not found on PATH. Install Codex CLI and verify `codex` runs in your shell, then retry.';
  }
  if (
    (lower.includes('failed to start claude') || lower.includes(' claude ') || lower.includes('start claude'))
    && (lower.includes("no such file") || lower.includes("not found") || lower.includes("enoent"))
  ) {
    return 'Claude CLI was not found on PATH. Install Claude Code CLI and verify `claude` runs in your shell, then retry.';
  }
  if (lower.includes('auth') || lower.includes('login') || lower.includes('expired') || lower.includes('unauthorized')) {
    return 'Agent authentication is required or expired. Re-auth in the CLI (`codex` or `claude`) and start the session again.';
  }
  if (lower.includes('workspace root path does not exist') || lower.includes('workspace root path is not a directory')) {
    return 'Workspace path is invalid or missing. Re-scan repositories, verify the worktree still exists, then reopen this workspace.';
  }
  if (lower.includes('not a git worktree')) {
    return 'Workspace path is no longer a valid Git worktree. Recreate the workspace from a valid repo/worktree.';
  }
  if (lower.includes('failed to open pty') || lower.includes('failed to start') || lower.includes('failed to attach terminal')) {
    return `Session failed to start. Check CLI install/auth and workspace path, then retry. (${raw})`;
  }
  if (lower.includes('interrupted')) {
    return 'Session was interrupted. Use Reconnect or Rerun to resume work.';
  }
  if (lower.includes('stale')) {
    return 'Session appears stale. Reconnect to reattach, or rerun to start a fresh agent session.';
  }
  return raw;
}

export function formatWorkspaceCreationError(err: unknown): string {
  const raw = text(err);
  const lower = raw.toLowerCase();

  if (lower.includes('already exists') && lower.includes('branch')) {
    return 'Branch name already exists in this repository. Choose a different branch name and try again.';
  }
  if (lower.includes('workspace path already exists') || lower.includes('worktree') && lower.includes('already exists')) {
    return 'Target worktree path already exists. Rename the branch/workspace or remove the conflicting worktree path.';
  }
  if (lower.includes('unsupported branch name') || lower.includes('branch name is required')) {
    return 'Branch name is invalid. Use a git-safe name (no spaces or special path characters).';
  }
  if (lower.includes('repository path does not exist') || lower.includes('repository') && lower.includes('not found')) {
    return 'Repository path is invalid or missing. Re-scan repositories in Settings and try again.';
  }
  if (lower.includes('failed to run git') || lower.includes('git command failed') || lower.includes('cannot create child workspace')) {
    return `Git operation failed while creating the workspace. Verify repo health and branch base, then retry. (${raw})`;
  }
  return raw;
}

export function formatCursorOpenError(err: unknown): string {
  const raw = text(err);
  const lower = raw.toLowerCase();

  if (lower.includes('cursor cli') || lower.includes('failed to launch cursor') || lower.includes('command not found')) {
    return 'Cursor CLI is not available. Install Cursor command-line tools and ensure `cursor` is on PATH.';
  }
  if (lower.includes('path is unavailable') || lower.includes('not a directory') || lower.includes('does not exist')) {
    return 'Workspace path is unavailable. Re-scan repositories/worktrees and verify the folder still exists.';
  }
  if (lower.includes('non-zero exit code') || lower.includes('cursor failed')) {
    return `Cursor launch failed. Retry after checking Cursor CLI setup and workspace path. (${raw})`;
  }
  return raw;
}
