import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, 
  ChevronRight, 
  ChevronDown, 
  ChevronLeft, 
  Copy, 
  Check, 
  Trash2, 
  Clock, 
  Layers,
  Eye,
  Pin,
  FlaskConical,
  Activity
} from 'lucide-react';
import type { TraceSession, SubExpression, PinnedExpression } from '../types';
import { buildCallRecords, buildLineExprs, isFuturePending } from '../utils/calls';
import type { CallRecord } from '../utils/calls';

interface BirdseyePageProps {
  session: TraceSession;
  onCallChange?: (fileName: string, funcName: string) => void;
  onOpenSandbox?: () => void;
}

export const BirdseyePage: React.FC<BirdseyePageProps> = ({ session, onCallChange, onOpenSandbox }) => {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'flow' | 'values' | 'locals' | 'pinned'>('flow');
  const [selectedExprText, setSelectedExprText] = useState<string | null>(null);
  const [hoveredExpr, setHoveredExpr] = useState<SubExpression | null>(null);
  const [pinnedList, setPinnedList] = useState<PinnedExpression[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedFuncs, setExpandedFuncs] = useState<Record<string, boolean>>({});

  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // 1. Group events into structured function calls
  const calls = useMemo<CallRecord[]>(() => buildCallRecords(session), [session]);

  // Group calls by function name
  const callsByFunc = useMemo(() => {
    const map = new Map<string, CallRecord[]>();
    calls.forEach((c) => {
      const arr = map.get(c.func) || [];
      arr.push(c);
      map.set(c.func, arr);
    });
    return map;
  }, [calls]);

  // Active call selection
  const activeCall = useMemo<CallRecord | null>(() => {
    if (calls.length === 0) return null;
    if (selectedCallId) {
      const found = calls.find((c) => c.id === selectedCallId);
      if (found) return found;
    }
    const best = calls.find((c) => c.expressions.length > 0);
    return best || calls[0];
  }, [calls, selectedCallId]);

  // Auto-scroll to active call's function definition or first executed line
  useEffect(() => {
    if (activeCall) {
      const targetLine = activeCall.callLine || (activeCall.events.length > 0 ? activeCall.events[0].line : null);
      if (targetLine && lineRefs.current[targetLine]) {
        lineRefs.current[targetLine]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeCall?.id]);

  // Source lines for the active call's file
  const activeFileIdx = activeCall ? activeCall.file_idx : 0;
  const sourceLines = useMemo(() => {
    return session.file_sources[activeFileIdx] || [];
  }, [session, activeFileIdx]);

  // Calls of the current function (for step 1/3)
  const currentFuncCalls = useMemo(() => {
    if (!activeCall) return [];
    return calls.filter((c) => c.func === activeCall.func);
  }, [calls, activeCall]);

  const currentCallIndex = useMemo(() => {
    if (!activeCall) return 0;
    return currentFuncCalls.findIndex((c) => c.id === activeCall.id);
  }, [currentFuncCalls, activeCall]);

  const handleStepCall = (delta: number) => {
    const next = currentCallIndex + delta;
    if (next >= 0 && next < currentFuncCalls.length) {
      setSelectedCallId(currentFuncCalls[next].id);
      setSelectedExprText(null);
    }
  };

  // Notify parent of active file / func
  useEffect(() => {
    if (activeCall && onCallChange) {
      const fileName = session.files[activeCall.file_idx]?.split(/[\\/]/).pop() || 'script.py';
      onCallChange(fileName, activeCall.func);
    }
  }, [activeCall, onCallChange, session.files]);

  // Map of line -> expressions evaluated during this call
  const lineExprsMap = useMemo(() => buildLineExprs(activeCall), [activeCall]);

  // Map of line -> variable mutations during this call
  const lineVarsDiffMap = useMemo(() => {
    const map = new Map<number, Record<string, { old: string; new: string }>>();
    if (!activeCall) return map;
    activeCall.events.forEach((ev) => {
      if (ev.vars_diff && Object.keys(ev.vars_diff).length > 0) {
        const existing = map.get(ev.line) || {};
        map.set(ev.line, { ...existing, ...ev.vars_diff });
      }
    });
    return map;
  }, [activeCall]);

  // Return line of active call
  const returnLine = useMemo(() => {
    if (!activeCall) return null;
    const returnEv = activeCall.events.slice().reverse().find((e) => e.kind === 'return' || e.return_val);
    return returnEv ? returnEv.line : null;
  }, [activeCall]);

  // Unique list of expressions evaluated in this call
  const evaluatedExpressionsList = useMemo(() => {
    if (!activeCall) return [];
    const seen = new Set<string>();
    const list: SubExpression[] = [];
    activeCall.expressions.forEach((expr) => {
      const key = `${expr.text}:::${expr.val}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(expr);
      }
    });
    return list;
  }, [activeCall]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleTogglePin = (expr: SubExpression) => {
    setPinnedList((prev) => {
      const exists = prev.find((p) => p.text === expr.text);
      if (exists) {
        return prev.filter((p) => p.text !== expr.text);
      }
      return [
        ...prev,
        {
          id: `pin-${expr.text}`,
          text: expr.text,
          line: 0,
          func: activeCall?.func || '',
          val: expr.val,
          type_name: expr.type_name || 'unknown',
          pinnedAtEventSeq: activeCall?.startSeq || 0,
        },
      ];
    });
  };

  const toggleFuncExpand = (fn: string) => {
    setExpandedFuncs((prev) => ({
      ...prev,
      [fn]: prev[fn] === undefined ? false : !prev[fn],
    }));
  };

  if (calls.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/80 dark:border-slate-800/80 shadow-xl flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center mb-4">
            <Eye className="w-7 h-7 text-indigo-500" />
          </div>
          <h2 className="text-lg font-bold">No Expression Traces Recorded</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Expression Flow evaluates every sub-expression, condition, and return value inside each function call (just like the Alex Hall Birdseye debugger).
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        
        {/* COLUMN 1: Function Calls Sidebar (280px / 3 cols) */}
        <aside className="col-span-12 md:col-span-3 border-r border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090e1a]/90 flex flex-col h-full overflow-hidden transition-colors">
          <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0b1220]/90">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                Calls History ({calls.length})
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter calls / search functions..."
                className="w-full bg-white dark:bg-[#050811] border border-slate-200 dark:border-white/[0.12] rounded-md pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs">
            {Array.from(callsByFunc.entries())
              .filter(([fn]) => !searchFilter || fn.toLowerCase().includes(searchFilter.toLowerCase()))
              .map(([fn, fnCalls]) => {
                const isExpanded = expandedFuncs[fn] !== false;

                return (
                  <div key={fn} className="rounded-md border border-slate-200/80 dark:border-white/[0.08]/80 overflow-hidden bg-slate-50/50 dark:bg-[#0c1322]/50 backdrop-blur-xs">
                    <button
                      onClick={() => toggleFuncExpand(fn)}
                      className="w-full px-2.5 py-1.5 bg-slate-100/70 dark:bg-[#0e172a]/70 hover:bg-slate-100 dark:hover:bg-indigo-950/40 flex items-center justify-between text-left text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        )}
                        <span className="truncate text-indigo-600 dark:text-indigo-400">{fn}()</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                        {fnCalls.length} call{fnCalls.length > 1 ? 's' : ''}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60 p-1">
                        {fnCalls.map((call, idx) => {
                          const isSelected = activeCall?.id === call.id;
                          const argsSummary = Object.entries(call.args)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ') || 'no args';

                          return (
                            <div
                              key={call.id}
                              onClick={() => {
                                setSelectedCallId(call.id);
                                setSelectedExprText(null);
                              }}
                              className={`p-2 rounded cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-[11px]">
                                  #{idx + 1}
                                </span>
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {call.duration_ms.toFixed(2)}ms
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-1">
                                {argsSummary}
                              </div>

                              {call.return_val && !isFuturePending(call.return_val) && (
                                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate font-medium flex items-center gap-1">
                                  <span>➔</span>
                                  <span className="truncate">{call.return_val}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </aside>

        {/* COLUMN 2: Center Code Studio */}
        <main className="col-span-12 md:col-span-6 flex flex-col h-full bg-white dark:bg-[#050811] border-r border-slate-200 dark:border-white/[0.08] overflow-hidden transition-colors">
          <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#090e1a]/90 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {activeCall ? `${activeCall.func}()` : 'No function selected'}
                </span>
                {activeCall?.return_val && !isFuturePending(activeCall.return_val) && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 truncate max-w-xs">
                    ➔ {activeCall.return_val}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {activeCall
                  ? Object.entries(activeCall.args).map(([k, v]) => `${k}=${v}`).join(', ') || 'no arguments'
                  : ''}
              </div>
            </div>

            {currentFuncCalls.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.12] rounded-md px-2 py-1 text-xs font-mono">
                <button
                  onClick={() => handleStepCall(-1)}
                  disabled={currentCallIndex === 0}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                  title="Previous call"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                  {currentCallIndex + 1} / {currentFuncCalls.length}
                </span>
                <button
                  onClick={() => handleStepCall(1)}
                  disabled={currentCallIndex === currentFuncCalls.length - 1}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                  title="Next call"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed select-text">
            {sourceLines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const lineExprs = lineExprsMap.get(lineNum) || [];
              const lineDiffs = lineVarsDiffMap.get(lineNum);
              const hasExprs = lineExprs.length > 0;
              const isReturnStep = lineNum === returnLine;

              return (
                <div
                  key={lineNum}
                  ref={(el) => {
                    lineRefs.current[lineNum] = el;
                  }}
                  className={`group flex flex-col rounded px-2 py-1 transition-colors ${
                    hasExprs || lineDiffs || isReturnStep
                      ? 'bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/20 opacity-75'
                  }`}
                >
                  <div className="flex items-start">
                    <span className="w-8 text-right pr-3 text-slate-400 dark:text-slate-600 select-none text-xs flex-shrink-0">
                      {lineNum}
                    </span>
                    <span className="whitespace-pre flex-1 text-slate-800 dark:text-slate-200">
                      {lineText}
                    </span>
                  </div>

                  {/* Alex Hall Birdseye-style Branch Decision Pill on if/elif lines */}
                  {(() => {
                    const isConditionLine = /^\s*(if|elif)\s+/.test(lineText);
                    if (!isConditionLine || lineExprs.length === 0) return null;
                    const trueExpr = lineExprs.find(e => e.val === 'True' || e.val === 'true' || (e.is_bool && e.bool_val === true) || e.truthy === true);
                    const falseExpr = lineExprs.find(e => e.val === 'False' || e.val === 'false' || (e.is_bool && e.bool_val === false) || e.truthy === false);
                    if (trueExpr) {
                      return (
                        <div className="ml-8 mt-1 flex items-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            ✔ Branch Taken (True)
                          </span>
                        </div>
                      );
                    }
                    if (falseExpr) {
                      return (
                        <div className="ml-8 mt-1 flex items-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            ✖ Branch Skipped (False)
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Variable Mutations on this line */}
                  {lineDiffs && Object.keys(lineDiffs).length > 0 && (
                    <div className="ml-8 mt-1 flex flex-wrap items-center gap-1.5 select-none pt-0.5">
                      {Object.entries(lineDiffs).map(([vName, diff]) => (
                        <span
                          key={vName}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-xs"
                        >
                          <span className="font-semibold">{vName}</span>
                          <span>:=</span>
                          <span className="font-bold truncate max-w-[160px]">{diff.new}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Sub-expressions evaluated on this line */}
                  {hasExprs && (
                    <div className="ml-8 mt-1 flex flex-wrap items-center gap-1.5 select-none pt-0.5">
                      {lineExprs.map((expr, i) => {
                        const isSelected = selectedExprText === expr.text;
                        const isHovered = hoveredExpr?.text === expr.text;
                        const isTrue = expr.val === 'True' || expr.val === 'true' || (expr.is_bool && expr.bool_val === true) || expr.truthy === true;
                        const isFalse = expr.val === 'False' || expr.val === 'false' || (expr.is_bool && expr.bool_val === false) || expr.truthy === false;

                        let badgeCls = 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.12] hover:border-indigo-400 dark:hover:border-indigo-500';
                        if (isSelected || isHovered) {
                          badgeCls = isTrue
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-400/40'
                            : isFalse
                            ? 'bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-400/40'
                            : 'bg-indigo-600 text-white border-indigo-700 shadow-sm';
                        } else if (isTrue) {
                          badgeCls = 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-semibold hover:border-emerald-500';
                        } else if (isFalse) {
                          badgeCls = 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700 font-semibold hover:border-rose-500';
                        }

                        return (
                          <div key={`expr-wrapper-${lineNum}-${i}-${expr.text}`} className="relative inline-block">
                            <button
                              onClick={() => {
                                setSelectedExprText(expr.text);
                                handleTogglePin(expr);
                              }}
                              onMouseEnter={() => setHoveredExpr(expr)}
                              onMouseLeave={() => setHoveredExpr(null)}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border transition-all cursor-pointer ${badgeCls}`}
                              title={`Click to pin or inspect: ${expr.text}`}
                            >
                              <span className="truncate max-w-[160px] opacity-90">{expr.text}</span>
                              {isTrue ? (
                                <span className="font-bold">✔ True</span>
                              ) : isFalse ? (
                                <span className="font-bold">✖ False</span>
                              ) : (
                                <span className="font-bold opacity-100 text-emerald-600 dark:text-emerald-400 group-hover:text-white">
                                  = {expr.val}
                                </span>
                              )}
                            </button>

                            {/* Floating Rich Tooltip on Hover */}
                            {isHovered && (
                              <div className="absolute bottom-full left-0 mb-2 z-50 min-w-[260px] max-w-sm p-3 rounded-xl bg-slate-900/95 dark:bg-[#0c1322]/95 backdrop-blur-md text-white border border-slate-700/80 shadow-2xl text-xs font-mono select-text pointer-events-auto">
                                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                                  <span className="font-bold text-indigo-400 truncate max-w-[170px]">{expr.text}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">{expr.type_name || 'expr'}</span>
                                </div>
                                <div className="mb-2 text-slate-200">
                                  <span className="text-slate-400 text-[10px] uppercase font-semibold mr-1">Evaluated:</span>
                                  <span className={`font-bold ${isTrue ? 'text-emerald-400' : isFalse ? 'text-rose-400' : 'text-emerald-300'}`}>
                                    {isTrue ? '✔ True' : isFalse ? '✖ False' : expr.val}
                                  </span>
                                </div>
                                {expr.length !== undefined && (
                                  <div className="mb-1.5 text-[11px] text-slate-300">
                                    Length: <strong className="text-white">{expr.length} items</strong>
                                  </div>
                                )}
                                {expr.items_preview && (
                                  <div className="mb-2 text-[10px] bg-slate-950 p-2 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-24">
                                    {Array.isArray(expr.items_preview) ? (
                                      <div>[{expr.items_preview.join(', ')}]</div>
                                    ) : (
                                      <div>{JSON.stringify(expr.items_preview, null, 2)}</div>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800 text-[10px]">
                                  <span className="text-slate-400">AST: {expr.node_type || 'expression'}</span>
                                  <span className="text-indigo-400">Click to pin to watchlist</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Return Line Highlight */}
                  {isReturnStep && activeCall?.return_val && !isFuturePending(activeCall.return_val) && (
                    <div className="ml-8 mt-1 flex items-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        <span>➔</span>
                        <span>Return: {activeCall.return_val}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Live Value Inspection Bar (Real Birdseye Inspector) */}
          <div className="border-t border-slate-200 dark:border-white/[0.08] bg-slate-50/95 dark:bg-[#090e1a]/95 px-4 py-2 flex items-center justify-between gap-3 text-xs font-mono shrink-0 select-none">
            {hoveredExpr || selectedExprText ? (
              (() => {
                const activeExpr = hoveredExpr || evaluatedExpressionsList.find((e) => e.text === selectedExprText);
                if (!activeExpr) {
                  return <span className="text-slate-400 text-[11px]">Hover or click any expression above to inspect live value</span>;
                }
                const isTrue = activeExpr.val === 'True' || activeExpr.val === 'true' || activeExpr.truthy === true;
                const isFalse = activeExpr.val === 'False' || activeExpr.val === 'false' || activeExpr.truthy === false;
                return (
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold shrink-0">Expression:</span>
                    <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs">
                      {activeExpr.text}
                    </span>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold shrink-0">Value:</span>
                    <span className={`px-2 py-0.5 rounded border font-bold truncate max-w-sm ${
                      isTrue ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                      isFalse ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' :
                      'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                    }`}>
                      {isTrue ? '✔ True' : isFalse ? '✖ False' : activeExpr.val}
                    </span>
                    {activeExpr.type_name && (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline">
                        type: <strong className="text-slate-600 dark:text-slate-300">{activeExpr.type_name}</strong>
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCopy(activeExpr.val, `bar-${activeExpr.text}`)}
                        className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        {copiedKey === `bar-${activeExpr.text}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === `bar-${activeExpr.text}` ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={() => handleTogglePin(activeExpr)}
                        className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        <Pin className="w-3 h-3" />
                        <span>{pinnedList.some((p) => p.text === activeExpr.text) ? 'Unpin' : 'Pin'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>Hover or click any expression to inspect full value representation and type details</span>
              </div>
            )}
          </div>
        </main>

        {/* COLUMN 3: Right Inspection Dock */}
        <aside className="col-span-12 md:col-span-3 flex flex-col h-full bg-white dark:bg-[#090e1a]/90 overflow-hidden transition-colors">
          <div className="h-11 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0b1220]/90 px-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('flow')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  activeTab === 'flow'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-white/[0.12]'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Activity className="w-3 h-3 text-indigo-500" />
                <span>Flow ({activeCall ? activeCall.events.length : 0})</span>
              </button>
              <button
                onClick={() => setActiveTab('values')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'values'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-white/[0.12]'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Evaluated ({evaluatedExpressionsList.length})
              </button>
              <button
                onClick={() => setActiveTab('locals')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'locals'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-white/[0.12]'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Locals
              </button>
              <button
                onClick={() => setActiveTab('pinned')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'pinned'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-white/[0.12]'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Pinned ({pinnedList.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            {activeTab === 'flow' && (
              <div className="space-y-2">
                {!activeCall || activeCall.events.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No execution steps recorded for this call.
                  </div>
                ) : (
                  activeCall.events.map((ev, stepIdx) => {
                    const isCall = ev.kind === 'call';
                    const isReturn = ev.kind === 'return';
                    const isException = ev.kind === 'exception';
                    const isCondition = /^\s*(if|elif)\s+/.test(ev.src);
                    const diffEntries = Object.entries(ev.vars_diff || {});
                    const hasDiffs = diffEntries.length > 0;
                    const lineExprs = ev.expressions || [];

                    return (
                      <div
                        key={`step-${stepIdx}-${ev.seq}`}
                        onClick={() => {
                          if (lineRefs.current[ev.line]) {
                            lineRefs.current[ev.line]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="p-2.5 rounded-md border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-slate-900/40 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold">
                              #{stepIdx + 1}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              Line {ev.line}
                            </span>
                          </div>
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                            isCall ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                            isReturn ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                            isException ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' :
                            'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}>
                            {ev.kind}
                          </span>
                        </div>

                        {/* Source code preview */}
                        <div className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate bg-white dark:bg-slate-950/80 p-1.5 rounded border border-slate-200/60 dark:border-white/[0.06] mb-1.5">
                          {ev.src || `(line ${ev.line})`}
                        </div>

                        {/* Condition outcome if branch */}
                        {isCondition && lineExprs.length > 0 && (() => {
                          const trueExpr = lineExprs.find(e => e.val === 'True' || e.val === 'true' || (e.is_bool && e.bool_val === true) || e.truthy === true);
                          const falseExpr = lineExprs.find(e => e.val === 'False' || e.val === 'false' || (e.is_bool && e.bool_val === false) || e.truthy === false);
                          if (trueExpr) {
                            return (
                              <div className="mb-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                <span>✔</span> Branch taken (True)
                              </div>
                            );
                          }
                          if (falseExpr) {
                            return (
                              <div className="mb-1 text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                                <span>✖</span> Branch skipped (False)
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Variable mutations on this step */}
                        {hasDiffs && (
                          <div className="space-y-0.5 mb-1 text-[10px] font-mono">
                            {diffEntries.map(([vName, diff]) => (
                              <div key={vName} className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{vName}</span>
                                <span>:=</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[140px]">{diff.new}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sub-expressions evaluated on this step */}
                        {lineExprs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {lineExprs.map((expr, eIdx) => (
                              <span
                                key={eIdx}
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-50/70 dark:bg-indigo-950/40 text-slate-700 dark:text-slate-300 border border-indigo-200/50 dark:border-indigo-800/50"
                              >
                                <span className="opacity-80 truncate max-w-[90px]">{expr.text}</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">= {expr.val}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Return outcome */}
                        {isReturn && ev.return_val && !isFuturePending(ev.return_val) && (
                          <div className="mt-1 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <span>➔</span>
                            <span className="truncate">Returned {ev.return_val}</span>
                          </div>
                        )}

                        {/* Exception outcome */}
                        {isException && ev.exc_type && (
                          <div className="mt-1 text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            <span>⚠</span>
                            <span className="truncate">{ev.exc_type}: {ev.exc_val}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'values' && (
              <div className="space-y-2">
                {evaluatedExpressionsList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No sub-expressions captured for this call.
                  </div>
                ) : (
                  evaluatedExpressionsList.map((expr, i) => {
                    const isSelected = selectedExprText === expr.text;

                    return (
                      <div
                        key={`eval-${i}-${expr.text}`}
                        onClick={() => setSelectedExprText(expr.text)}
                        className={`p-2.5 rounded-md border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-500/70'
                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[190px]">
                            {expr.text}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {expr.type_name}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/[0.08]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[200px]">
                            {expr.val}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(expr.val, `val-${i}`);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title="Copy value"
                          >
                            {copiedKey === `val-${i}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'locals' && (
              <div className="space-y-1.5">
                {Object.keys(activeCall?.args || {}).length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No variables available.
                  </div>
                ) : (
                  Object.entries(activeCall?.args || {}).map(([k, v]) => (
                    <div
                      key={k}
                      className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/[0.08] flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{k}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 truncate max-w-[160px] font-medium">
                        {v}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'pinned' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>Tracked Watchlist</span>
                  {pinnedList.length > 0 && (
                    <button
                      onClick={() => setPinnedList([])}
                      className="text-rose-500 hover:text-rose-600 flex items-center gap-1 text-[10px] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>

                {pinnedList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Click any expression chip to pin it here.
                  </div>
                ) : (
                  pinnedList.map((p) => (
                    <div
                      key={p.id}
                      className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/[0.08] space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                          {p.text}
                        </span>
                        <button
                          onClick={() => setPinnedList((prev) => prev.filter((item) => item.id !== p.id))}
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-bold truncate">
                        {p.val}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
};
