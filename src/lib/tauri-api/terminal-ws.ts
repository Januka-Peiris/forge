import { invokeCommand } from './client';

interface TerminalWsInfo {
  port: number;
  token: string;
}

let cached: TerminalWsInfo | null = null;

export async function getTerminalWsInfo(): Promise<TerminalWsInfo> {
  if (cached) return cached;
  cached = await invokeCommand<TerminalWsInfo>('get_terminal_ws_info');
  return cached;
}
