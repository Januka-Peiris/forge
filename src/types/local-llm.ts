export interface LocalLlmModel {
  provider: string;
  name: string;
  size?: string | null;
  modified?: string | null;
}

export interface LocalLlmProfileDiagnostic {
  status: 'ok' | 'warning' | 'error' | string;
  summary: string;
  commandPreview: string;
  checks: LocalLlmProfileDiagnosticCheck[];
}

export interface LocalLlmProfileDiagnosticCheck {
  name: string;
  status: 'ok' | 'warning' | 'error' | string;
  message: string;
}
