const SLOW_MEASURE_MS = 250;

export function perfMark(name: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(name);
  } catch {
    // Ignore unavailable marks in embedded/webview edge cases.
  }
}

export function perfMeasure(label: string, startMark: string): number | null {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return null;
  const endMark = `${startMark}:end`;
  try {
    performance.mark(endMark);
    const measure = performance.measure(label, startMark, endMark);
    if (measure.duration >= SLOW_MEASURE_MS) {
      console.info(`[forge-perf] ${label}: ${Math.round(measure.duration)}ms`);
    }
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(label);
    return measure.duration;
  } catch {
    return null;
  }
}

export async function measureAsync<T>(label: string, task: () => Promise<T>): Promise<T> {
  const start = `forge:${label}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  perfMark(start);
  try {
    return await task();
  } finally {
    perfMeasure(label, start);
  }
}
