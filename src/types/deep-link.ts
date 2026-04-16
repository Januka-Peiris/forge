export interface OpenDeepLinkInput {
  url?: string;
  repo?: string;
  branch?: string;
  prompt?: string;
  agent?: string;
  baseBranch?: string;
}

export interface OpenDeepLinkResult {
  workspaceId: string;
  created: boolean;
  promptSent: boolean;
}
