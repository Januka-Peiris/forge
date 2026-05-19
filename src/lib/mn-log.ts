/**
 * Structured logs for debugging Tauri IPC flows. Open WebView DevTools (Cmd+Option+I on macOS),
 * filter console by `[Mnemonic]`. Backend logs appear in the terminal that runs `tauri dev`
 * (set RUST_LOG=debug for more noise, default is info via env_logger init).
 */
export function mnLog(area: string, message: string, detail?: unknown): void {
  const tag = '[Mnemonic]';
  if (detail !== undefined) console.info(tag, area + ':', message, detail);
  else console.info(tag, area + ':', message);
}

export function mnWarn(area: string, message: string, detail?: unknown): void {
  const tag = '[Mnemonic]';
  if (detail !== undefined) console.warn(tag, area + ':', message, detail);
  else console.warn(tag, area + ':', message);
}
