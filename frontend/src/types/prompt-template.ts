export interface PromptTemplate {
  id: string;
  title: string;
  body: string;
  source: string;
}

export interface WorkspacePromptTemplates {
  templates: PromptTemplate[];
  warning?: string | null;
}
