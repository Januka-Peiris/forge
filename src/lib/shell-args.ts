/**
 * Small shell-like args parser for profile configuration.
 *
 * This is intentionally not a shell evaluator: it only splits one input string
 * into argv-style tokens with quote/backslash handling. It does not expand
 * variables, globs, command substitutions, or redirections.
 */
export function parseCommandArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (escaped) current += '\\';
  if (quote) throw new Error(`Unclosed ${quote === '"' ? 'double' : 'single'} quote in args`);
  if (current) args.push(current);
  return args;
}

export function formatCommandPreview(command: string, args: string[]): string {
  return [command, ...args].filter(Boolean).map(quoteArgIfNeeded).join(' ');
}

function quoteArgIfNeeded(arg: string): string {
  if (!arg) return "''";
  if (!/\s|["'\\]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
