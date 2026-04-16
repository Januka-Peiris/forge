/** Two-word labels (kebab-case) for default workspace names — easy to read in sidebars and overwritable. */

const ADJECTIVES = [
  'amber', 'azure', 'brisk', 'calm', 'civic', 'clear', 'clever', 'coastal', 'crimson', 'curious',
  'dapper', 'durable', 'eager', 'ember', 'fluent', 'gentle', 'golden', 'hidden', 'humble', 'ideal',
  'jagged', 'keen', 'linear', 'lively', 'lunar', 'mellow', 'merry', 'misty', 'modern', 'nimble',
  'orbital', 'patient', 'polar', 'quiet', 'rapid', 'satin', 'silent', 'silver', 'sleek', 'solar',
  'steady', 'stone', 'sunny', 'swift', 'tidal', 'timber', 'tiny', 'urban', 'valid', 'velvet', 'woven',
];

const NOUNS = [
  'badger', 'beacon', 'bloom', 'brook', 'castle', 'cipher', 'coral', 'creek', 'crystal', 'delta',
  'falcon', 'forest', 'forge', 'glacier', 'harbor', 'harvest', 'heron', 'horizon', 'island', 'jetty',
  'lagoon', 'lattice', 'meadow', 'mirror', 'mosaic', 'nest', 'oak', 'orchard', 'pinnacle', 'pixel',
  'prairie', 'quartz', 'rapids', 'raven', 'reef', 'ridge', 'river', 'saddle', 'summit', 'tundra',
  'violet', 'willow', 'winter', 'yarn', 'zenith',
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Returns a fresh `adjective-noun` slug suitable as a workspace display name. */
export function suggestForgeWorkspaceLabel(): string {
  const adj = pick(ADJECTIVES);
  let noun = pick(NOUNS);
  // Avoid redundant "ember-ember" style pairs when both lists overlap.
  if (adj === noun) noun = pick(NOUNS);
  return `${adj}-${noun}`;
}

/** Branch name aligned with a workspace label slug (caller may still edit). */
export function defaultBranchForWorkspaceLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `feat/${slug || 'workspace'}`;
}
