import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  FlaskConical,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  ArrowRight,
  Copy,
  Check,
  Search,
  Code2,
  Sparkles,
  Pin,
  CornerDownRight,
  Bot,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Send,
  Trash2,
  Wrench,
  AlertCircle
} from 'lucide-react';

interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  promptType?: 'explain' | 'alteration' | 'edge_cases' | 'rca' | 'custom';
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const tokens = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{tok.slice(2, -2)}</strong>;
    }
    if (tok.startsWith('`') && tok.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono text-[11px] border border-slate-200 dark:border-white/[0.08]">{tok.slice(1, -1)}</code>;
    }
    return tok;
  });
}

const MarkdownContent: React.FC<{ text: string }> = ({ text }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-xs leading-relaxed font-sans text-slate-800 dark:text-slate-200">
      {parts.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trimStart().split('\n');
          const firstLine = lines[0].trim();
          const hasLang = firstLine && !firstLine.includes(' ') && !firstLine.includes(':');
          const lang = hasLang ? firstLine : '';
          const code = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

          const handleCopy = () => {
            navigator.clipboard.writeText(code);
            setCopiedIndex(idx);
            setTimeout(() => setCopiedIndex(null), 1500);
          };

          return (
            <div key={idx} className="my-2 rounded-lg overflow-hidden border border-slate-700/60 bg-slate-950 text-slate-100 shadow-xs font-mono text-[11px]">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400">
                <span className="uppercase tracking-wider font-semibold text-indigo-400">{lang || 'CODE'}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Copy code"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 overflow-x-auto whitespace-pre font-mono leading-normal select-text">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const lines = part.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;

              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-1.5">
                    <span className="text-indigo-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
                  </div>
                );
              }

              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-1.5">
                    <span className="text-indigo-400 font-bold shrink-0 mt-0.5 font-mono text-[10px]">{numMatch[1]}.</span>
                    <span>{renderInlineMarkdown(numMatch[2])}</span>
                  </div>
                );
              }

              if (trimmed.startsWith('### ')) {
                return <h4 key={lIdx} className="font-semibold text-slate-900 dark:text-slate-100 text-xs mt-2">{renderInlineMarkdown(trimmed.slice(4))}</h4>;
              }
              if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
                return <h3 key={lIdx} className="font-bold text-slate-900 dark:text-slate-100 text-xs mt-2">{renderInlineMarkdown(trimmed.replace(/^#+\s*/, ''))}</h3>;
              }

              return <p key={lIdx}>{renderInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};
import type { TraceSession, TraceEvent, AiExplanation, AIProviderConfig } from '../types';

interface HunterPageProps {
  session: TraceSession;
  onEventChange?: (fileName: string, funcName: string) => void;
  aiConfig?: AIProviderConfig | null;
  onOpenAiSettings?: () => void;
  onOpenSandbox?: () => void;
}

export const HunterPage: React.FC<HunterPageProps> = ({ session, onEventChange, aiConfig, onOpenAiSettings, onOpenSandbox }) => {
  const events = session.events || [];
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 0.5x, 1x, 2x, 4x
  const [activeTab, setActiveTab] = useState<'locals' | 'ai' | 'delta' | 'stack' | 'stream' | 'logs'>('locals');
  const [hunterLogQuery, setHunterLogQuery] = useState<string>('');
  const [hunterLogLevel, setHunterLogLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'STDOUT'>('ALL');
  const [copiedHunterLogs, setCopiedHunterLogs] = useState<boolean>(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [varSearchQuery, setVarSearchQuery] = useState<string>('');
  const [streamFilter, setStreamFilter] = useState<string>('');
  const [filterKind, setFilterKind] = useState<'all' | 'call' | 'line' | 'return'>('all');
  const [pinnedVars, setPinnedVars] = useState<string[]>([]);

  // AI Co-Pilot State
  const [, setAiExplanation] = useState<AiExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiCache, setAiCache] = useState<Record<number, AiExplanation>>({});
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState<string>('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const currentEvent: TraceEvent | undefined = events[currentIdx];

  // Notify parent of active file/func change
  useEffect(() => {
    if (currentEvent && onEventChange) {
      const fileName = session.files[currentEvent.file_idx] || 'source.py';
      onEventChange(fileName.split(/[\\/]/).pop() || fileName, currentEvent.func);
    }
  }, [currentEvent, session.files, onEventChange]);

  // Auto-focus logic: start at step 0 (first executed line) unless uncaught exception
  useEffect(() => {
    if (events.length > 0) {
      const hasUncaught = Boolean(session.stats?.has_uncaught_error);
      const errorLine = (session.stats as any)?.error_line;
      if (hasUncaught && errorLine !== undefined) {
        const excIdx = events.findIndex(
          (ev) => ev.kind === 'exception' || Boolean(ev.exc_type) || ev.line === errorLine
        );
        if (excIdx !== -1) {
          setCurrentIdx(excIdx);
          return;
        }
      }
      setCurrentIdx(0);
    } else {
      setCurrentIdx(0);
    }
  }, [session.id, session.events]);

  // Auto-scroll code view to keep current executing line in view
  useEffect(() => {
    if (currentEvent) {
      const el = lineRefs.current[currentEvent.line];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentEvent]);

  // Timer for Play / Pause playback
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.round(320 / playbackSpeed);

    const timer = setInterval(() => {
      setCurrentIdx((prev) => {
        if (prev >= events.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, events.length]);

  const sendAiChat = async (promptType: 'explain' | 'alteration' | 'edge_cases' | 'rca' | 'custom', customQuery?: string) => {
    if (!currentEvent || aiLoading) return;
    const queryText = customQuery || (promptType === 'custom' ? aiChatInput : '');
    if (promptType === 'custom' && !queryText.trim()) return;

    let displayUserText = queryText;
    if (promptType === 'explain') displayUserText = `⚡ Explain line ${currentEvent.line}: ${currentEvent.src.trim()}`;
    else if (promptType === 'alteration') displayUserText = `🛠️ Suggest code alteration for line ${currentEvent.line}`;
    else if (promptType === 'edge_cases') displayUserText = `🛡️ Audit edge cases for line ${currentEvent.line}`;
    else if (promptType === 'rca') displayUserText = `🔍 Root cause analysis on line ${currentEvent.line}`;

    const userMsg: AiChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      content: displayUserText,
      timestamp: Date.now(),
      promptType,
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (promptType === 'custom') setAiChatInput('');
    setAiLoading(true);

    try {
      const historyPayload = aiMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          func: currentEvent.func,
          line: currentEvent.line,
          src: currentEvent.src,
          vars: currentEvent.vars,
          vars_diff: currentEvent.vars_diff,
          expressions: currentEvent.expressions || [],
          history: historyPayload,
          prompt_type: promptType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.response || data.explanation || 'No response returned from AI.';
        const assistantMsg: AiChatMessage = {
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: replyText,
          timestamp: Date.now(),
          promptType,
        };
        setAiMessages((prev) => [...prev, assistantMsg]);
        setAiExplanation({
          explanation: replyText,
          suggestion: 'Refer to interactive AI Co-Pilot chat thread for detailed steps.',
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        const assistantMsg: AiChatMessage = {
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: `⚠️ Request failed (${res.status}): ${errData.error || res.statusText}. Open AI settings to verify provider.`,
          timestamp: Date.now(),
        };
        setAiMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      const assistantMsg: AiChatMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        role: 'assistant',
        content: `⚠️ Failed to connect to AI server: ${err.message}. Open AI settings to verify endpoint.`,
        timestamp: Date.now(),
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ai' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, aiLoading, activeTab]);

  // Fetch AI explanation for the current line
  const fetchAiExplanation = async (promptType = 'explain') => {
    if (!currentEvent) return;

    // Check local client cache
    if (aiCache[currentEvent.seq] && promptType === 'explain') {
      setAiExplanation(aiCache[currentEvent.seq]);
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/explain-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          func: currentEvent.func,
          line: currentEvent.line,
          src: currentEvent.src,
          vars: currentEvent.vars,
          vars_diff: currentEvent.vars_diff,
          expressions: currentEvent.expressions || [],
          prompt_type: promptType,
        }),
      });

      if (res.ok) {
        const data: AiExplanation = await res.json();
        setAiExplanation(data);
        setAiCache((prev) => ({ ...prev, [currentEvent.seq]: data }));
      }
    } catch (err) {
      setAiExplanation({
        explanation: `Line ${currentEvent.line} executed in ${currentEvent.func}().`,
        suggestion: `Unable to query ${aiConfig?.provider || 'AI'} provider. Click 'Configure AI' to verify your connection and settings.`,
      });
    } finally {
      setAiLoading(false);
    }
  };

  // When stepping lines in AI tab, auto-fetch or read from cache
  useEffect(() => {
    if (activeTab === 'ai' && currentEvent) {
      if (aiCache[currentEvent.seq]) {
        setAiExplanation(aiCache[currentEvent.seq]);
      } else {
        fetchAiExplanation();
      }
    }
  }, [currentIdx, activeTab]);

  // Keyboard navigation shortcuts: Space = Play/Pause, ArrowLeft = Step Back, ArrowRight = Step Forward
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIdx((p) => Math.max(0, p - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIdx((p) => Math.min(events.length - 1, p + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [events.length]);

  // Stepping controls
  const handleFirst = () => {
    setIsPlaying(false);
    setCurrentIdx(0);
  };

  const handlePrev = () => {
    setIsPlaying(false);
    setCurrentIdx((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setIsPlaying(false);
    setCurrentIdx((prev) => Math.min(events.length - 1, prev + 1));
  };

  const handleLast = () => {
    setIsPlaying(false);
    setCurrentIdx(events.length - 1);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentIdx(Number(e.target.value));
  };

  // Get current file code lines
  const currentFileIdx = currentEvent?.file_idx ?? 0;
  const currentFileName = session.files[currentFileIdx] || 'app.py';
  const displayFileName = currentFileName.split(/[\\/]/).pop() || currentFileName;
  const sourceLines = session.file_sources[currentFileIdx] || [];

  // Filtered stream events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterKind !== 'all' && ev.kind !== filterKind) return false;
      if (!streamFilter.trim()) return true;
      const q = streamFilter.toLowerCase();
      return (
        ev.func.toLowerCase().includes(q) ||
        ev.src.toLowerCase().includes(q) ||
        String(ev.line).includes(q)
      );
    });
  }, [events, filterKind, streamFilter]);

  // Filtered locals in scope
  const currentVars = currentEvent?.vars || {};
  const currentDiffs = currentEvent?.vars_diff || {};

  const filteredVars = useMemo(() => {
    const entries = Object.entries(currentVars);
    if (!varSearchQuery.trim()) return entries;
    const q = varSearchQuery.toLowerCase();
    return entries.filter(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q));
  }, [currentVars, varSearchQuery]);

  // Compute call stack for current event
  const callStack = useMemo(() => {
    if (!currentEvent) return [];
    const stack: { func: string; line: number; depth: number; seq: number }[] = [];
    const seenDepths = new Set<number>();

    for (let i = currentIdx; i >= 0; i--) {
      const ev = events[i];
      if (!seenDepths.has(ev.depth) && (stack.length === 0 || ev.depth < stack[stack.length - 1].depth)) {
        seenDepths.add(ev.depth);
        stack.push({
          func: ev.func,
          line: ev.line,
          depth: ev.depth,
          seq: ev.seq,
        });
      }
    }
    return stack.reverse();
  }, [currentEvent, currentIdx, events]);

  const copyToClipboard = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedVar(key);
    setTimeout(() => setCopiedVar(null), 1500);
  };

  const sessionLogs = session.logs || [];
  const filteredSessionLogs = useMemo(() => {
    return sessionLogs.filter((l) => {
      if (hunterLogLevel === 'INFO' && l.level !== 'INFO') return false;
      if (hunterLogLevel === 'WARN' && l.level !== 'WARNING' && l.level !== 'WARN') return false;
      if (hunterLogLevel === 'ERROR' && l.level !== 'ERROR' && l.level !== 'CRITICAL') return false;
      if (hunterLogLevel === 'STDOUT' && l.level !== 'STDOUT' && l.level !== 'STDERR') return false;
      if (!hunterLogQuery.trim()) return true;
      const q = hunterLogQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.logger.toLowerCase().includes(q) ||
        (l.file && l.file.toLowerCase().includes(q))
      );
    });
  }, [sessionLogs, hunterLogLevel, hunterLogQuery]);

  const copyHunterLogs = () => {
    const text = sessionLogs.map(l => `[${l.level}] ${l.logger}: ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedHunterLogs(true);
    setTimeout(() => setCopiedHunterLogs(false), 1500);
  };

  const jumpToLog = (log: { line?: number; timestamp: number }) => {
    if (log.line) {
      const idx = events.findIndex(e => e.line === log.line);
      if (idx !== -1) {
        setCurrentIdx(idx);
        return;
      }
    }
    let closestIdx = 0;
    let minDiff = Infinity;
    events.forEach((e, i) => {
      const diff = Math.abs(e.timestamp - log.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    setCurrentIdx(closestIdx);
  };

  const togglePin = (name: string) => {
    setPinnedVars((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // Helper for variable type detection
  const inferType = (val: string): { label: string; badgeClass: string } => {
    if (val === 'True' || val === 'False') {
      return {
        label: 'bool',
        badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      };
    }
    if (/^-?\d+$/.test(val)) {
      return {
        label: 'int',
        badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      };
    }
    if (/^-?\d+\.\d+$/.test(val)) {
      return {
        label: 'float',
        badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      };
    }
    if (val.startsWith("'") || val.startsWith('"')) {
      return {
        label: 'str',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      };
    }
    if (val.startsWith('{')) {
      return {
        label: 'dict',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      };
    }
    if (val.startsWith('[')) {
      return {
        label: 'list',
        badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      };
    }
    return {
      label: 'val',
      badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    };
  };

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'call':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'return':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'exception':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.12]';
    }
  };

  if (events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/80 dark:border-slate-800/80 shadow-xl flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center mb-4">
            <Play className="w-7 h-7 fill-current pl-1" />
          </div>
          <h2 className="text-lg font-bold">No Traced Execution Loaded</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Timeline Replay allows you to step through execution event-by-event with variable mutations and AST sub-expressions.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={onOpenSandbox}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
            >
              <FlaskConical className="w-4 h-4" />
              <span>Open Live Sandbox</span>
            </button>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 w-full text-left font-mono text-[11px] text-slate-500">
            <span className="text-slate-400"># or trace code directly in Python:</span>
            <div className="mt-1 p-2.5 rounded-lg bg-slate-900 text-slate-200 border border-slate-800">
              from pydebug import tracer<br/>
              with tracer:<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;my_function(...)
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 transition-colors">
      {/* 1. TOP TIMELINE PLAYER CONTROLS */}
      <div className="h-16 px-4 bg-white dark:bg-[#090e1a]/90 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-4 select-none z-10 shrink-0">
        {/* Play & Step Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFirst}
            disabled={currentIdx === 0}
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-400 transition-colors"
            title="Jump to Start (First Event) [Home]"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-400 transition-colors"
            title="Step Backward (Previous Line) [← Left Arrow]"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsPlaying((p) => !p)}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium text-xs text-white shadow-sm transition-all ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
            }`}
            title={isPlaying ? 'Pause Execution [Space]' : 'Play / Auto-Step Execution [Space]'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={currentIdx >= events.length - 1}
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-400 transition-colors"
            title="Step Forward (Next Line) [→ Right Arrow]"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={handleLast}
            disabled={currentIdx >= events.length - 1}
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-400 transition-colors"
            title="Jump to End (Final Event) [End]"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

          <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-md border border-slate-200 dark:border-white/[0.08] text-[11px] font-mono">
            {[0.5, 1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  playbackSpeed === spd
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Center: Timeline Scrubber Bar */}
        <div className="flex-1 max-w-2xl flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={currentIdx}
            onChange={handleScrubberChange}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
          />
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              #{currentIdx + 1}
            </span>
            <span>/</span>
            <span>{events.length}</span>
            <span className="text-[10px] text-slate-400">
              ({events.length ? Math.round(((currentIdx + 1) / events.length) * 100) : 0}%)
            </span>
          </div>
        </div>

        {/* Right: Current Event Details Badge */}
        {currentEvent && (
          <div className="hidden lg:flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium border uppercase tracking-wider ${getKindBadge(
                currentEvent.kind
              )}`}
            >
              {currentEvent.kind}
            </span>
            <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200">
              {currentEvent.func}()
            </span>
            <span className="text-xs font-mono text-slate-400">
              :L{currentEvent.line}
            </span>
          </div>
        )}
      </div>

      {/* 2. MAIN 2-PANEL LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: SOURCE CODE VIEWER WITH LIVE POINTER & INLINE VARIABLES */}
        <div className="flex-1 flex flex-col border-r border-slate-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#060911]">
          {/* File Header Tab */}
          <div className="h-9 px-4 bg-slate-100/70 dark:bg-[#090e1a]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono select-none">
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-medium text-slate-800 dark:text-slate-200">{displayFileName}</span>
              <span className="text-[11px] text-slate-400">
                (Depth: {currentEvent?.depth ?? 0})
              </span>
            </div>

            {currentEvent?.return_val && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px]">
                <span>Returned:</span>
                <span className="font-semibold">{currentEvent.return_val}</span>
              </div>
            )}
          </div>

          {/* Exception Banner */}
          {currentEvent?.exc_type && (
            <div className="mx-2 mt-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs shrink-0" role="alert">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">{currentEvent.exc_type}</span>
              {currentEvent.exc_val && (
                <pre className="font-mono text-[11px] text-rose-800 dark:text-rose-200 whitespace-pre-wrap break-words select-text m-0 overflow-visible">
                  {currentEvent.exc_val}
                </pre>
              )}
              {currentEvent.line != null && (
                <span className="ml-auto text-[10px] font-mono text-rose-500/70 shrink-0">Line {currentEvent.line}</span>
              )}
            </div>
          )}

          {/* PROMINENT SCOPE VARIABLES HUD */}
          {currentEvent && Object.keys(currentVars).length > 0 && (
            <div className="px-4 py-2.5 bg-slate-50/95 dark:bg-[#0b1325]/95 border-b border-slate-200/80 dark:border-white/[0.08] shadow-xs select-none shrink-0 font-mono">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Scope Variables
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    {Object.keys(currentVars).length} active
                  </span>
                  {Object.keys(currentDiffs).length > 0 && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                      {Object.keys(currentDiffs).length} changed this line
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-thin">
                {Object.entries(currentVars).map(([k, v]) => {
                  const diff = currentDiffs[k];
                  const wasChanged = Boolean(diff);
                  return (
                    <div
                      key={k}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs shrink-0 border transition-all ${
                        wasChanged
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/20'
                          : 'bg-white dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-white/[0.1] hover:border-slate-300'
                      }`}
                    >
                      <span className="font-semibold text-slate-600 dark:text-slate-400">
                        {k}:
                      </span>
                      {wasChanged && diff.old !== '<unset>' && (
                        <span className="text-[11px] text-slate-400 line-through truncate max-w-[80px]">
                          {diff.old}
                        </span>
                      )}
                      {wasChanged && diff.old !== '<unset>' && (
                        <span className="text-emerald-500 text-[10px]">➔</span>
                      )}
                      <span className={`font-mono font-bold truncate max-w-[180px] ${
                        wasChanged ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-100'
                      }`}>
                        {v}
                      </span>
                      {wasChanged && (
                        <span className="text-[9px] px-1 py-0.2 uppercase font-extrabold rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                          CHANGED
                        </span>
                      )}
                      <button
                        onClick={() => copyToClipboard(`hud-${k}`, v)}
                        className="ml-1 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title={`Copy ${k}`}
                      >
                        {copiedVar === `hud-${k}` ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Code Viewer */}
          <div className="flex-1 overflow-auto font-mono text-[13px] leading-6 select-text p-2">
            {sourceLines.map((lineText, zeroIdx) => {
              const lineNum = zeroIdx + 1;
              const isCurrentLine = currentEvent?.line === lineNum;
              const subExprs = isCurrentLine ? currentEvent.expressions : undefined;

              const isExceptionLine = isCurrentLine && (currentEvent?.kind === 'exception' || Boolean(currentEvent?.exc_type));
              return (
                <div
                  key={lineNum}
                  ref={(el) => {
                    lineRefs.current[lineNum] = el;
                  }}
                  className={`group flex flex-col rounded transition-colors ${
                    isCurrentLine
                      ? isExceptionLine
                        ? 'bg-rose-50/95 dark:bg-rose-950/50 border-l-4 border-rose-600 dark:border-rose-400 shadow-xs'
                        : 'bg-indigo-50/90 dark:bg-indigo-950/40 border-l-3 border-indigo-600 dark:border-indigo-400 shadow-xs'
                      : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/20'
                  }`}
                >
                  <div className="flex items-center">
                    {/* Line Execution Pointer Gutter */}
                    <div className="w-10 text-right pr-2 select-none shrink-0 flex items-center justify-end">
                      {isCurrentLine ? (
                        <div className="flex items-center text-indigo-600 dark:text-indigo-400">
                          <ArrowRight className="w-3.5 h-3.5 animate-pulse" />
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 dark:text-slate-600">
                          {lineNum}
                        </span>
                      )}
                    </div>

                    {/* Source Code Content */}
                    <div
                      className={`flex-1 pl-3 font-mono whitespace-pre overflow-x-auto ${
                        isCurrentLine
                          ? 'font-medium text-slate-900 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {lineText}
                    </div>
                  </div>

                  {/* Sub-expressions evaluated on this active line */}
                  {subExprs && subExprs.length > 0 && (
                    <div className="pl-13 pr-4 py-1 flex flex-wrap gap-1.5 bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-indigo-100/50 dark:border-indigo-900/30">
                      {subExprs.map((expr, eIdx) => (
                        <div
                          key={eIdx}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-slate-800 dark:text-slate-200 shadow-xs"
                        >
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            {expr.text}
                          </span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                            = {expr.val}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>


        </div>

        {/* RIGHT PANEL: RICH VARIABLE INSPECTOR & AI CO-PILOT DOCK */}
        <div className="w-[460px] flex flex-col bg-slate-50/70 dark:bg-[#090e1a]/90 backdrop-blur-md overflow-hidden select-none shrink-0 border-l border-slate-200 dark:border-white/[0.08]">
          {/* Top Sub-tabs Selector */}
          <div className="h-10 px-3 bg-white dark:bg-[#060911] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-1 shrink-0">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium">
              <button
                onClick={() => setActiveTab('locals')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  activeTab === 'locals'
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Vars ({Object.keys(currentVars).length})</span>
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  activeTab === 'logs'
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Logs ({sessionLogs.length})</span>
                {sessionLogs.some(l => l.level === 'ERROR' || l.level === 'CRITICAL') && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('stack')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  activeTab === 'stack'
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <CornerDownRight className="w-3.5 h-3.5" />
                <span>Call Stack</span>
              </button>

              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  activeTab === 'ai'
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-300" />
                <span>AI Co-Pilot</span>
              </button>
            </div>
          </div>

          {/* TAB 1: VARIABLES & LOCALS */}
          {activeTab === 'locals' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-2.5 border-b border-slate-200 dark:border-white/[0.08] bg-white/50 dark:bg-slate-900/30 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={varSearchQuery}
                    onChange={(e) => setVarSearchQuery(e.target.value)}
                    placeholder="Search variables by name or value..."
                    className="w-full pl-8 pr-3 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {currentDiffs && Object.keys(currentDiffs).length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 shadow-xs space-y-2 mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Mutations On Line {currentEvent?.line} ({Object.keys(currentDiffs).length}):</span>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(currentDiffs).map(([k, delta]) => (
                        <div key={k} className="flex items-center gap-2 text-xs font-mono bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg border border-amber-200/80 dark:border-amber-800/40">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{k}:</span>
                          <span className="text-rose-500 line-through truncate max-w-[110px]" title={delta.old}>{delta.old || 'None'}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate" title={delta.new}>{delta.new}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {filteredVars.length > 0 ? (
                  filteredVars.map(([name, val]) => {
                    const isPinned = pinnedVars.includes(name);
                    const isModified = Boolean(currentDiffs[name]);
                    const typeInfo = inferType(val);

                    return (
                      <div
                        key={name}
                        className={`p-2.5 rounded-lg border transition-all ${
                          isModified
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                              {name}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono border uppercase tracking-wider ${typeInfo.badgeClass}`}
                            >
                              {typeInfo.label}
                            </span>
                            {isModified && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-medium">
                                <Sparkles className="w-2.5 h-2.5" />
                                Modified
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => togglePin(name)}
                              className={`p-1 rounded transition-colors ${
                                isPinned
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                              }`}
                              title={isPinned ? 'Unpin variable' : 'Pin variable'}
                            >
                              <Pin className="w-3 h-3 fill-current" />
                            </button>
                            <button
                              onClick={() => copyToClipboard(name, val)}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                              title="Copy value"
                            >
                              {copiedVar === name ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-white/[0.08]/60 overflow-x-auto whitespace-pre-wrap break-all select-text max-h-32">
                          {val}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400 font-mono">
                    {varSearchQuery ? 'No variables matching search' : 'No local variables in current scope'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI CO-PILOT STUDIO (Multi-Provider: Ollama, OpenAI, DeepSeek, Custom) */}
          {activeTab === 'ai' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950/30">
              {/* Header: Provider & Model + Controls */}
              <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 flex items-center justify-between shrink-0 shadow-2xs">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Bot className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        AI Co-Pilot
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 capitalize">
                        {aiConfig?.provider || 'Ollama'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">
                      {aiConfig?.model || 'qwen2.5:7b-instruct'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {aiMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAiMessages([])}
                      className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Clear chat history"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onOpenAiSettings && (
                    <button
                      type="button"
                      onClick={onOpenAiSettings}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 transition-colors cursor-pointer"
                      title="Configure AI Provider & Model"
                    >
                      Configure AI
                    </button>
                  )}
                </div>
              </div>

              {/* Target Line Context Banner */}
              <div className="px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-white/[0.08] shrink-0">
                <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                  <span className="text-slate-500 font-semibold tracking-wide">
                    ANALYZING LINE {currentEvent?.line}:
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                    {currentEvent?.func}()
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-md border border-slate-200/80 dark:border-white/[0.06]">
                  {currentEvent?.src || 'No source line available'}
                </div>
              </div>

              {/* Quick Action Chips Bar */}
              <div className="px-3.5 py-2 border-b border-slate-200/70 dark:border-white/[0.06] bg-white/60 dark:bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
                <button
                  type="button"
                  onClick={() => sendAiChat('explain')}
                  disabled={aiLoading}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 transition-colors flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>⚡ Explain Line</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendAiChat('alteration')}
                  disabled={aiLoading}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 transition-colors flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Wrench className="w-3 h-3 text-emerald-500" />
                  <span>🛠️ Suggest Fix</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendAiChat('edge_cases')}
                  disabled={aiLoading}
                  className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300 transition-colors flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <ShieldAlert className="w-3 h-3 text-amber-500" />
                  <span>🛡️ Edge Cases</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendAiChat('rca')}
                  disabled={aiLoading}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/60 text-[11px] font-semibold text-rose-700 dark:text-rose-300 transition-colors flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                  <span>🔍 Root Cause</span>
                </button>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {aiMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div className="max-w-xs space-y-1">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Interactive AI Debugging Studio
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Select a prompt above or ask any freeform question about runtime variables, code logic, or failures.
                      </p>
                    </div>

                    <div className="w-full grid grid-cols-2 gap-2 max-w-sm pt-2">
                      <button
                        type="button"
                        onClick={() => sendAiChat('explain')}
                        className="p-3 text-left rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-indigo-500/60 transition-all cursor-pointer shadow-2xs group"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-500">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Explain Line</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Break down line behavior with active variable values.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => sendAiChat('alteration')}
                        className="p-3 text-left rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-emerald-500/60 transition-all cursor-pointer shadow-2xs group"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-500">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Suggest Fix</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Propose a safer, idiomatic Python code refactoring.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => sendAiChat('edge_cases')}
                        className="p-3 text-left rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-amber-500/60 transition-all cursor-pointer shadow-2xs group"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 group-hover:text-amber-500">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Audit Edges</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Detect None, zero, empty collection exceptions.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => sendAiChat('rca')}
                        className="p-3 text-left rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-rose-500/60 transition-all cursor-pointer shadow-2xs group"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 group-hover:text-rose-500">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Root Cause</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Diagnose unexpected exceptions or return states.
                        </p>
                      </button>
                    </div>
                  </div>
                ) : (
                  aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-2xl p-3.5 shadow-2xs ${
                          msg.role === 'user'
                            ? 'bg-indigo-600 text-white font-medium text-xs rounded-br-xs'
                            : 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-white/[0.08] rounded-bl-xs w-full'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-1.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                <Bot className="w-3.5 h-3.5" />
                                <span>AI CO-PILOT</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                            <MarkdownContent text={msg.content} />
                          </div>
                        ) : (
                          <div className="text-xs whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {aiLoading && (
                  <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400 shadow-2xs max-w-sm">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                    <span>Analyzing live runtime execution with {aiConfig?.provider || 'AI'}...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Container */}
              <div className="p-3 border-t border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendAiChat('custom');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={aiChatInput}
                    onChange={(e) => setAiChatInput(e.target.value)}
                    placeholder={`Ask about line ${currentEvent?.line || ''} or variables...`}
                    disabled={aiLoading}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/[0.1] text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!aiChatInput.trim() || aiLoading}
                    className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer shrink-0"
                    title="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: LINE MUTATIONS (DELTA) */}
          {activeTab === 'delta' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Variable values changed on line {currentEvent?.line} in {currentEvent?.func}():
              </div>

              {currentDiffs && Object.keys(currentDiffs).length > 0 ? (
                Object.entries(currentDiffs).map(([k, delta]) => (
                  <div
                    key={k}
                    className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono font-medium text-slate-800 dark:text-slate-200">
                      <span>{k}</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        MUTATION
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-white/[0.08]/60">
                      <div className="flex-1 text-rose-500 dark:text-rose-400 line-through truncate" title={delta.old}>
                        {delta.old}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="flex-1 text-emerald-600 dark:text-emerald-400 font-semibold truncate" title={delta.new}>
                        {delta.new}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-white/[0.08] rounded-lg">
                  No variable mutations occurred on this specific line
                </div>
              )}
            </div>
          )}

          {/* TAB: EXECUTION LOGS */}
          {activeTab === 'logs' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-2.5 border-b border-slate-200 dark:border-white/[0.08] bg-white/50 dark:bg-slate-900/30 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={hunterLogQuery}
                      onChange={(e) => setHunterLogQuery(e.target.value)}
                      placeholder="Search session logs..."
                      className="w-full pl-8 pr-3 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  {sessionLogs.length > 0 && (
                    <button
                      onClick={copyHunterLogs}
                      className="px-2 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:text-slate-900 text-xs flex items-center gap-1 cursor-pointer shrink-0"
                      title="Copy all logs"
                    >
                      {copiedHunterLogs ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedHunterLogs ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px] font-mono overflow-x-auto pb-0.5">
                  {(['ALL', 'INFO', 'WARN', 'ERROR', 'STDOUT'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setHunterLogLevel(lvl)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                        hunterLogLevel === lvl
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.1] hover:border-slate-300'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
                {filteredSessionLogs.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
                    <Terminal className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 stroke-1" />
                    <p>{sessionLogs.length === 0 ? 'No logs recorded in this session.' : 'No logs match search query.'}</p>
                  </div>
                ) : (
                  filteredSessionLogs.map((log, idx) => {
                    const isError = log.level === 'ERROR' || log.level === 'CRITICAL';
                    const isWarn = log.level === 'WARNING' || log.level === 'WARN';
                    const isStdout = log.level === 'STDOUT' || log.level === 'STDERR';

                    const badgeCls = isError
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      : isWarn
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : isStdout
                      ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
                      : 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';

                    return (
                      <div
                        key={idx}
                        onClick={() => jumpToLog(log)}
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer group hover:border-indigo-400 ${
                          isError
                            ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/[0.08]'
                        }`}
                        title="Click to jump to this point in timeline"
                      >
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border uppercase tracking-wide shrink-0 ${badgeCls}`}>
                              {log.level}
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate text-[11px]" title={log.logger}>
                              {log.logger}
                            </span>
                          </div>
                          {log.file && (
                            <span className="text-[10px] text-slate-400 truncate shrink-0">
                              {log.file}:{log.line}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words select-text">
                          {log.message}
                        </div>

                        {log.exc_info && (
                          <pre className="mt-1.5 p-2 rounded bg-slate-950 text-rose-300 text-[10px] overflow-x-auto whitespace-pre-wrap">
                            {log.exc_info}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CALL STACK NAVIGATOR */}
          {activeTab === 'stack' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Active execution call frames (deepest at bottom):
              </div>

              {callStack.map((frame, fIdx) => {
                const isCurrentFrame = fIdx === callStack.length - 1;
                return (
                  <button
                    key={frame.seq}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentIdx(frame.seq);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs font-mono transition-all flex items-center justify-between ${
                      isCurrentFrame
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[10px]">Depth {frame.depth}</span>
                      <span>{frame.func}()</span>
                      <span className="text-slate-400">:L{frame.line}</span>
                    </div>

                    {isCurrentFrame && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold">
                        ACTIVE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 5: HUNTER STREAM LOG */}
          {activeTab === 'stream' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-2 border-b border-slate-200 dark:border-white/[0.08] bg-slate-100/50 dark:bg-slate-900/50 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Filter Stream
                  </span>

                  <div className="flex items-center gap-1">
                    {(['all', 'line', 'call', 'return'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setFilterKind(k)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono capitalize transition-colors ${
                          filterKind === k
                            ? 'bg-slate-900 dark:bg-slate-700 text-white font-medium'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={streamFilter}
                    onChange={(e) => setStreamFilter(e.target.value)}
                    placeholder="Search stream..."
                    className="w-full pl-6 pr-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-200/50 dark:divide-slate-800/40 font-mono text-[11px]">
                {filteredEvents.map((ev) => {
                  const isSelected = ev.seq === currentEvent?.seq;

                  return (
                    <button
                      key={ev.seq}
                      onClick={() => {
                        setIsPlaying(false);
                        const actualIdx = events.findIndex((e) => e.seq === ev.seq);
                        if (actualIdx !== -1) setCurrentIdx(actualIdx);
                      }}
                      className={`w-full text-left p-2 flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium border-l-2 border-indigo-600'
                          : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/30 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-400 text-[10px]">#{ev.seq + 1}</span>
                        <span
                          className={`px-1 rounded text-[9px] uppercase font-semibold border ${getKindBadge(
                            ev.kind
                          )}`}
                        >
                          {ev.kind}
                        </span>
                        <span className="truncate">
                          {ev.func}:L{ev.line}
                        </span>
                      </div>

                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        {ev.src.trim()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HunterPage;
