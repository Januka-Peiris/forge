import { useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { Save, X } from 'lucide-react';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-typescript';

export interface EditorTab {
  path: string;
  content: string;
  savedContent: string;
  loading: boolean;
  error: string | null;
}

function detectPrismLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'ts' || ext === 'mts' || ext === 'cts') return 'typescript';
  if (ext === 'tsx') return 'tsx';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'jsx') return 'jsx';
  if (ext === 'json') return 'json';
  if (ext === 'css' || ext === 'scss') return 'css';
  if (ext === 'md') return 'markdown';
  if (ext === 'rs') return 'rust';
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') return 'bash';
  return 'clike';
}

interface WorkspaceTerminalEditorPanelProps {
  openEditors: EditorTab[];
  activeEditorPath: string | null;
  filePreviewWidth: number;
  savingEditorPaths: Set<string>;
  onFilePreviewWidthChange: (width: number) => void;
  onActiveEditorPathChange: (path: string | null) => void;
  onCloseEditor: (path: string) => void;
  onEditorContentChange: (path: string, content: string) => void;
  onSaveEditor: (path: string) => void;
}

export function WorkspaceTerminalEditorPanel({
  openEditors,
  activeEditorPath,
  filePreviewWidth,
  savingEditorPaths,
  onFilePreviewWidthChange,
  onActiveEditorPathChange,
  onCloseEditor,
  onEditorContentChange,
  onSaveEditor,
}: WorkspaceTerminalEditorPanelProps) {
  const activeEditor = activeEditorPath ? openEditors.find((editor) => editor.path === activeEditorPath) ?? null : null;
  const activeEditorLanguage = activeEditor ? detectPrismLanguage(activeEditor.path) : 'clike';

  const highlightEditorCode = useCallback((code: string) => {
    const grammar = Prism.languages[activeEditorLanguage] ?? Prism.languages.clike;
    return Prism.highlight(code, grammar, activeEditorLanguage);
  }, [activeEditorLanguage]);

  const startFilePreviewResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = filePreviewWidth;
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      onFilePreviewWidthChange(Math.min(640, Math.max(280, startWidth - delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [filePreviewWidth, onFilePreviewWidthChange]);

  if (openEditors.length === 0) return null;

  return (
    <>
      <div
        role="separator"
        aria-label="Resize file preview panel"
        onMouseDown={startFilePreviewResize}
        onDoubleClick={() => onFilePreviewWidthChange(420)}
        className="w-1 shrink-0 cursor-col-resize rounded bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
        title="Double-click to reset width"
      />
      <div className="flex min-h-0 shrink-0 flex-col rounded-xl border border-forge-border bg-forge-card/70" style={{ width: `${filePreviewWidth}px` }}>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-forge-border px-2 py-2">
          {openEditors.map((editor) => {
            const dirty = editor.content !== editor.savedContent;
            const active = activeEditorPath === editor.path;
            return (
              <div key={editor.path} className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs ${active ? 'border-forge-green/30 bg-forge-green/10 text-forge-green' : 'border-forge-border bg-forge-card/70 text-forge-muted'}`}>
                <button
                  type="button"
                  onClick={() => onActiveEditorPathChange(editor.path)}
                  className="truncate text-left hover:text-forge-text"
                  title={editor.path}
                >
                  {dirty ? '● ' : ''}{editor.path.split('/').pop() ?? editor.path}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseEditor(editor.path)}
                  className="rounded p-0.5 hover:bg-forge-surface-overlay"
                  title="Close file"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {!activeEditor ? (
          <div className="flex flex-1 items-center justify-center text-sm text-forge-muted">Select a file from the Files tab.</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-forge-border px-3 py-2">
              <p className="truncate font-mono text-xs text-forge-text" title={activeEditor.path}>{activeEditor.path}</p>
              <button
                type="button"
                onClick={() => onSaveEditor(activeEditor.path)}
                disabled={activeEditor.loading || !!activeEditor.error || savingEditorPaths.has(activeEditor.path)}
                className="inline-flex items-center gap-1 rounded-md border border-forge-green/30 bg-forge-green/10 px-2 py-1 text-xs font-semibold text-forge-green disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {savingEditorPaths.has(activeEditor.path) ? 'Saving…' : 'Save'}
              </button>
            </div>

            {activeEditor.loading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-forge-muted">Loading file…</div>
            ) : activeEditor.error ? (
              <div className="p-3 text-sm text-forge-red">{activeEditor.error}</div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto bg-black/35 p-3 text-xs">
                <Editor
                  value={activeEditor.content}
                  onValueChange={(nextContent) => onEditorContentChange(activeEditor.path, nextContent)}
                  highlight={highlightEditorCode}
                  padding={0}
                  textareaClassName="outline-none font-mono"
                  preClassName="font-mono m-0"
                  className="min-h-full font-mono text-xs text-forge-text"
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
