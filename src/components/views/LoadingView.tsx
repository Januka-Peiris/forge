import { Button } from '../ui/button';

export function LoadingView() {
  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <div>
        <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-forge-border border-t-forge-orange animate-spin" />
        <p className="text-[13px] font-medium text-forge-muted">Loading Forge backend state…</p>
      </div>
    </div>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md rounded-2xl border border-forge-red/25 bg-forge-red/5 p-5">
        <p className="text-[13px] font-semibold text-forge-red">Could not load Tauri backend data</p>
        <p className="mt-2 text-[12px] leading-relaxed text-forge-muted">{message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          Retry
        </Button>
      </div>
    </div>
  );
}
