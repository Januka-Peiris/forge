import type { WorkspacePrDraft } from '../../types/pr-draft';

export function formatPrDraftMarkdown(draft: WorkspacePrDraft): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n');
  return [
    `# ${draft.title}`,
    '',
    '## Summary',
    draft.summary,
    '',
    '## Key changes',
    list(draft.keyChanges),
    '',
    '## Risks',
    list(draft.risks),
    '',
    '## Testing',
    list(draft.testingNotes),
  ].join('\n');
}
