export type SafetyLevel = 'safe' | 'informational' | 'risky' | 'blocked';

export interface CommandSafetyResult {
  command: string;
  safetyLevel: SafetyLevel;
  category: string;
  explanation: string;
  risks: string[];
}
