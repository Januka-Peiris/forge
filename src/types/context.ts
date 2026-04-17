export interface RepoSymbol {
  name: string;
  kind: string;
  signature: string | null;
  lineStart: number;
  lineEnd: number;
  symbolRank: number;
}

export interface RepoFlags {
  isTest: boolean;
  isConfig: boolean;
  isGenerated: boolean;
  isBinary: boolean;
}

export interface ContextSegment {
  path: string;
  tier: 'mandatory' | 'related' | string;
  renderMode: 'full' | 'diff_hunks' | 'symbol_card' | 'summary_line' | string;
  estimatedTokens: number;
  content: string;
}

export interface ContextPreview {
  included: ContextSegment[];
  excluded: string[];
  estimatedTokensContext: number;
  estimatedTokensTotal: number;
  staleMap: boolean;
  lowSignal: boolean;
  signalScore: number;
  warning: string | null;
}

export interface ContextStatus {
  stale: boolean;
  signalScore: number;
  symbolCoverage?: number;
  engine: string;
  filesIndexed?: number;
  symbolCount?: number;
  defaultBranch?: string;
  baseCommit?: string;
}
