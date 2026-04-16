import { invoke } from '@tauri-apps/api/core';
import { measureAsync } from '../perf';

export function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return measureAsync(`tauri:${command}`, () => invoke<T>(command, args));
}
