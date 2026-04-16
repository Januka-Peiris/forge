import { Terminal, Clock, Zap, DollarSign, ChevronRight, Send } from 'lucide-react';
import { useState } from 'react';
import type { AgentMessage } from '../../types';

interface AgentSessionProps {
  messages: AgentMessage[];
}

function MessageBubble({ message }: { message: AgentMessage }) {
  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-forge-border" />
        <span className="text-[10px] text-forge-muted font-mono whitespace-nowrap">{message.content}</span>
        <span className="text-[10px] text-forge-muted font-mono">{message.timestamp}</span>
        <div className="flex-1 h-px bg-forge-border" />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex items-start gap-2 py-1.5 group">
        <div className="w-5 h-5 rounded bg-forge-blue/20 border border-forge-blue/20 flex items-center justify-center shrink-0 mt-0.5">
          <ChevronRight className="w-3 h-3 text-forge-blue" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-forge-blue/90 font-medium leading-relaxed">{message.content}</p>
          <span className="text-[10px] text-forge-muted font-mono">{message.timestamp}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1.5 group">
      <div className="w-5 h-5 rounded bg-forge-violet/20 border border-forge-violet/20 flex items-center justify-center shrink-0 mt-0.5">
        <Terminal className="w-2.5 h-2.5 text-forge-violet" />
      </div>
      <div className="flex-1">
        <p className="text-[11px] text-forge-text/85 leading-relaxed font-mono">{message.content}</p>
        <span className="text-[10px] text-forge-muted font-mono">{message.timestamp}</span>
      </div>
    </div>
  );
}

export function AgentSession({ messages }: AgentSessionProps) {
  const [input, setInput] = useState('');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-forge-border bg-forge-bg/40 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
          <Clock className="w-3 h-3" />
          <span className="font-mono">00:11:48</span>
        </div>
        <div className="w-px h-3 bg-forge-border" />
        <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
          <Zap className="w-3 h-3" />
          <span className="font-mono">24.3k tokens</span>
        </div>
        <div className="w-px h-3 bg-forge-border" />
        <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
          <Terminal className="w-3 h-3" />
          <span>claude-3-7-sonnet</span>
        </div>
        <div className="w-px h-3 bg-forge-border" />
        <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
          <DollarSign className="w-3 h-3" />
          <span className="font-mono">~$0.38</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-forge-green animate-pulse" />
          <span className="text-[10px] text-forge-green font-medium">Active</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5 font-mono bg-[#0a0d12]">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div className="flex items-center gap-2 py-1.5">
          <div className="w-5 h-5 rounded bg-forge-violet/20 border border-forge-violet/20 flex items-center justify-center shrink-0">
            <Terminal className="w-2.5 h-2.5 text-forge-violet" />
          </div>
          <div className="flex items-center gap-1 text-forge-violet/70 text-[11px]">
            <span className="font-mono">Working</span>
            <span className="inline-flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-forge-violet/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-forge-violet/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-forge-violet/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-forge-border shrink-0">
        <div className="flex items-center gap-2 bg-forge-card border border-forge-border rounded-lg px-3 py-2 focus-within:border-forge-blue/40 transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-forge-muted shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send instruction to agent..."
            className="flex-1 bg-transparent text-[12px] font-mono text-forge-text placeholder:text-forge-muted/80 focus:outline-none"
          />
          <button className="shrink-0 p-1 rounded hover:bg-white/5 text-forge-muted hover:text-forge-text transition-colors">
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
