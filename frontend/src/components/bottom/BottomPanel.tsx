import { Terminal, FileCode, List, FileText, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { AgentSession } from './AgentSession';
import { DiffPreview } from './DiffPreview';
import { LogsTab } from './LogsTab';
import { NotesTab } from './NotesTab';
import type { AgentMessage, DiffFile, LogEntry } from '../../types';

type TabId = 'agent' | 'diff' | 'logs' | 'notes';

interface BottomPanelProps {
  messages: AgentMessage[];
  diffFiles: DiffFile[];
  logEntries: LogEntry[];
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'agent', label: 'Agent Session', icon: Terminal },
  { id: 'diff', label: 'Diff Preview', icon: FileCode },
  { id: 'logs', label: 'Logs', icon: List },
  { id: 'notes', label: 'Notes', icon: FileText },
];

export function BottomPanel({ messages, diffFiles, logEntries }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('agent');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`border-t border-forge-border bg-forge-surface flex flex-col transition-all duration-200 ${collapsed ? 'h-9' : 'h-[260px]'}`}>
      <div className="flex items-center border-b border-forge-border shrink-0 h-9 px-2">
        <div className="flex items-center">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setCollapsed(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                activeTab === id && !collapsed
                  ? 'bg-white/8 text-forge-text'
                  : 'text-forge-muted hover:text-forge-text hover:bg-white/4'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${activeTab === id && !collapsed ? 'text-forge-orange' : 'inherit'}`} strokeWidth={1.8} />
              {label}
              {id === 'agent' && (
                <span className="w-1.5 h-1.5 rounded-full bg-forge-green ml-0.5" />
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto p-1.5 rounded hover:bg-white/5 text-forge-muted hover:text-forge-text transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          {activeTab === 'agent' && <AgentSession messages={messages} />}
          {activeTab === 'diff' && <DiffPreview files={diffFiles} />}
          {activeTab === 'logs' && <LogsTab entries={logEntries} />}
          {activeTab === 'notes' && <NotesTab />}
        </div>
      )}
    </div>
  );
}
