import { invoke } from '@tauri-apps/api/core';
import type { CommandSafetyResult } from '../../types/command-safety';

export function checkShellCommandSafety(command: string): Promise<CommandSafetyResult> {
  return invoke('check_shell_command_safety', { command });
}
