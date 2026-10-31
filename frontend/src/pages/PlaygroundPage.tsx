import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  FlaskConical,
  Code2,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  Bug,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Search,
  Activity,
  Clock,
  Terminal,
  RotateCcw,
  FileCode,
  Sliders,
  WrapText,
  X,
} from 'lucide-react';
import type { TraceSession, FunctionSignature, LogEntry } from '../types';

interface PlaygroundPageProps {
  session: TraceSession;
  onSessionUpdated: (newSession: TraceSession) => void;
  onNavigateToHunter: () => void;
  initialFunction?: FunctionSignature | null;
  onConsumeInitialFunction?: () => void;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({
  session: _session,
  onSessionUpdated,
  onNavigateToHunter,
  initialFunction,
  onConsumeInitialFunction,
}) => {
  const [functions, setFunctions] = useState<FunctionSignature[]>([]);
  const [selectedFunc, setSelectedFunc] = useState<FunctionSignature | null>(initialFunction || null);
  const activeFuncRef = useRef<FunctionSignature | null>(initialFunction || null);

  // Quick Function Switcher Modal State
  const [showFuncModal, setShowFuncModal] = useState<boolean>(false);
  const [modalSearchQuery, setModalSearchQuery] = useState<string>('');

  // Interactive parameter values state: name -> raw input string
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  // Raw Python call expression arguments string (e.g. "value=5" or "5")
  const [callArgsStr, setCallArgsStr] = useState<string>('');

  // Return Value Wrap State & Docstring Toggle
  const [wrapReturnValue, setWrapReturnValue] = useState<boolean>(true);
  const [showDocstring, setShowDocstring] = useState<boolean>(true);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showTraceback, setShowTraceback] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    return_val: string;
    events_count: number;
    logs: LogEntry[];
    error: string | null;
    error_type?: string;
    error_message?: string;
    error_traceback?: string;
    error_file?: string;
    error_line?: number;
    duration_ms?: number;
  } | null>(null);

  const [outputTab, setOutputTab] = useState<'result' | 'logs'>('result');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'STDOUT'>('ALL');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Helper to build call arguments string from paramValues
  const buildCallString = (params: FunctionSignature['params'], values: Record<string, string>): string => {
    const parts: string[] = [];
    params.forEach((p) => {
      if (p.name === 'self' || p.name === 'cls') return;
      const val = values[p.name];
      if (val !== undefined && val.trim() !== '') {
        parts.push(`${p.name}=${val}`);
      }
    });
    return parts.join(', ');
  };

  // Helper to initialize parameters for a function
  const initParamsForFunc = (fn: FunctionSignature) => {
    const initialParams: Record<string, string> = {};
    fn.params.forEach((p) => {
      if (p.name === 'self' || p.name === 'cls') return;
      if (p.default !== null && p.default !== undefined) {
        initialParams[p.name] = String(p.default);
      } else if (fn.sample_valid && fn.sample_valid[p.name] !== undefined) {
        initialParams[p.name] = typeof fn.sample_valid[p.name] === 'string'
          ? `'${fn.sample_valid[p.name]}'`
          : JSON.stringify(fn.sample_valid[p.name]);
      } else {
        const ann = (p.annotation || '').toLowerCase();
        if (ann.includes('int')) initialParams[p.name] = '1';
        else if (ann.includes('float')) initialParams[p.name] = '1.0';
        else if (ann.includes('bool')) initialParams[p.name] = 'True';
        else if (ann.includes('list')) initialParams[p.name] = '[]';
        else if (ann.includes('dict')) initialParams[p.name] = '{}';
        else initialParams[p.name] = '';
      }
    });
    setParamValues(initialParams);
    setCallArgsStr(buildCallString(fn.params, initialParams));
  };

  // Fetch discoverable project functions from backend
  useEffect(() => {
    const fetchFuncs = async () => {
      try {
        const res = await fetch('/api/functions');
        if (res.ok) {
          const data: FunctionSignature[] = await res.json();
          if (data && data.length > 0) {
            setFunctions(data);
            const target = activeFuncRef.current || initialFunction;
            const matched = target
              ? data.find((f) => f.name === target.name && f.file_path === target.file_path) || data[0]
              : data[0];
            if (matched) {
              activeFuncRef.current = matched;
              setSelectedFunc(matched);
              initParamsForFunc(matched);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching functions:', err);
      }
    };
    fetchFuncs();
  }, []);

  // When initialFunction arrives from Dashboard "Try It Live"
  useEffect(() => {
    if (!initialFunction) return;
    activeFuncRef.current = initialFunction;
    const matched = functions.find(
      (f) => f.name === initialFunction.name && f.file_path === initialFunction.file_path
    );
    const target = matched || initialFunction;
    setSelectedFunc(target);
    initParamsForFunc(target);
    onConsumeInitialFunction?.();
  }, [initialFunction, functions]);

  // Global Ctrl+K / Cmd+K listener to open function switcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowFuncModal((prev) => !prev);
      } else if (e.key === 'Escape' && showFuncModal) {
        setShowFuncModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFuncModal]);

  const filteredModalFunctions = useMemo(() => {
    if (!modalSearchQuery.trim()) return functions;
    const q = modalSearchQuery.toLowerCase().trim();
    return functions.filter(
      (fn) =>
        fn.name.toLowerCase().includes(q) ||
        fn.file_path.toLowerCase().includes(q) ||
        fn.params.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [functions, modalSearchQuery]);

  const handleSelectFunction = (func: FunctionSignature) => {
    activeFuncRef.current = func;
    setSelectedFunc(func);
    initParamsForFunc(func);
    setLastResult(null);
    setShowFuncModal(false);
  };

  const handleParamChange = (paramName: string, val: string) => {
    if (!selectedFunc) return;
    const updated = { ...paramValues, [paramName]: val };
    setParamValues(updated);
    setCallArgsStr(buildCallString(selectedFunc.params, updated));
  };

  const handleCallArgsChange = (val: string) => {
    setCallArgsStr(val);
    if (selectedFunc && val.includes('=')) {
      const updated = { ...paramValues };
      const tokens = val.split(',');
      tokens.forEach((tok) => {
        const parts = tok.split('=');
        if (parts.length === 2) {
          const k = parts[0].trim();
          const v = parts[1].trim();
          if (updated[k] !== undefined) {
            updated[k] = v;
          }
        }
      });
      setParamValues(updated);
    }
  };

  const resetParamsToDefault = () => {
    if (!selectedFunc) return;
    initParamsForFunc(selectedFunc);
  };

  const runLiveExecution = async (overrideArgs?: Record<string, any>, targetFuncOverride?: FunctionSignature) => {
    const fn = targetFuncOverride || selectedFunc;
    if (!fn) return;

    setIsRunning(true);
    setLastResult(null);
    setShowTraceback(false);
    const startTime = performance.now();

    try {
      const payload: Record<string, any> = {
        file_path: fn.file_path,
        function_name: fn.name,
      };

      if (overrideArgs) {
        payload.args = overrideArgs;
      } else {
        payload.args = paramValues;
        if (callArgsStr.trim()) {
          payload.call_expr = `${fn.name}(${callArgsStr.trim()})`;
        }
      }

      const res = await fetch('/api/execute-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const elapsed = Math.max(0.1, performance.now() - startTime);

      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          onSessionUpdated(data.session);
        }
        setLastResult({
          success: data.success,
          return_val: data.return_val || '',
          events_count: data.session?.events?.length || 0,
          logs: data.session?.logs || [],
          error: data.error,
          error_type: data.error_type,
          error_message: data.error_message,
          error_traceback: data.error_traceback,
          error_file: data.error_file,
          error_line: data.error_line,
          duration_ms: elapsed,
        });
      } else {
        const err = await res.json();
        setLastResult({
          success: false,
          return_val: '',
          events_count: 0,
          logs: [],
          error: err.error || 'Server error during execution',
          error_type: err.error_type || 'ServerError',
          error_message: err.error_message || err.error,
          error_traceback: err.error_traceback,
          duration_ms: elapsed,
        });
      }
    } catch (err: any) {
      setLastResult({
        success: false,
        return_val: '',
        events_count: 0,
        logs: [],
        error: err.message,
        error_type: 'NetworkError',
        duration_ms: 0.1,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const logs = lastResult?.logs || [];
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (logLevelFilter === 'INFO' && l.level !== 'INFO') return false;
      if (logLevelFilter === 'WARN' && l.level !== 'WARNING' && l.level !== 'WARN') return false;
      if (logLevelFilter === 'ERROR' && l.level !== 'ERROR' && l.level !== 'CRITICAL') return false;
      if (logLevelFilter === 'STDOUT' && l.level !== 'STDOUT' && l.level !== 'STDERR') return false;
      if (!logSearchQuery.trim()) return true;
      const q = logSearchQuery.toLowerCase();
      return l.message.toLowerCase().includes(q) || l.logger.toLowerCase().includes(q);
    });
  }, [logs, logLevelFilter, logSearchQuery]);

  const copyAllLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.level}] ${l.logger}: ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 1500);
  };

  const copyResult = () => {
    if (lastResult?.return_val) {
      navigator.clipboard.writeText(lastResult.return_val);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const cleanParams = selectedFunc?.params.filter((p) => p.name !== 'self' && p.name !== 'cls') || [];
  const isMethod = Boolean(selectedFunc?.name.includes('.'));
  const methodName = isMethod ? selectedFunc!.name.split('.').pop() : selectedFunc?.name;
  const clsName = isMethod ? selectedFunc!.name.split('.').slice(0, -1).join('.') : null;
  const relativeFile = selectedFunc?.file_path.split(/[\\/]/).slice(-2).join('/') || selectedFunc?.file_path || '';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 transition-colors">
      {/* 2-Column Power Studio Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Spacious Function Invocation Studio (Left 55%) */}
        <div className="flex-1 flex flex-col bg-white dark:bg-[#090e1a] overflow-hidden border-r border-slate-200 dark:border-white/[0.08]">
          {/* Header Bar: Function Signature & Quick Switcher */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#0b1220]/50">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200/60 dark:border-indigo-800/60">
                    def
                  </span>
                  {clsName && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium">
                      {clsName}
                    </span>
                  )}
                  <span className="font-mono text-base font-bold text-slate-900 dark:text-white truncate">
                    {methodName || 'select_function'}()
                  </span>
                  {selectedFunc?.is_async && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
                      async coroutine
                    </span>
                  )}
                </div>

                <div
                  className="text-xs text-slate-400 font-mono mt-1.5 flex items-center gap-1.5 truncate"
                  title={selectedFunc?.file_path}
                >
                  <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{relativeFile}:{selectedFunc?.line}</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>{cleanParams.length} parameters</span>
                </div>
              </div>

              {/* Action Buttons: Switch Function & Reset */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowFuncModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] hover:border-indigo-500/50 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-xs transition-all cursor-pointer group"
                  title="Switch Target Function (Ctrl+K)"
                >
                  <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" />
                  <span>Switch Function</span>
                  <kbd className="hidden md:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
                    ⌘K
                  </kbd>
                </button>

                <button
                  onClick={resetParamsToDefault}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 transition-colors cursor-pointer"
                  title="Reset arguments to defaults"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Docstring */}
            {selectedFunc?.docstring && (
              <div className="mt-3">
                <div
                  onClick={() => setShowDocstring(!showDocstring)}
                  className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 cursor-pointer select-none mb-1 hover:text-indigo-500 transition-colors"
                >
                  {showDocstring ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span>Function Documentation</span>
                </div>
                {showDocstring && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-[#080d18] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.06] font-sans leading-relaxed whitespace-pre-line max-h-36 overflow-y-auto shadow-inner">
                    {selectedFunc.docstring}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Invocation Studio Body */}
          <div className="flex-1 flex flex-col p-5 overflow-y-auto space-y-5">
            {/* 1. Live Python Call Expression Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                  Python Invocation Expression
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Real-time call syntax
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-900 text-slate-100 flex items-center gap-1.5 font-mono text-xs shadow-inner">
                <span className="text-emerald-400 select-none font-bold">&gt;</span>
                <span className="text-indigo-400 font-semibold">{selectedFunc?.name || 'function'}(</span>
                <input
                  type="text"
                  value={callArgsStr}
                  onChange={(e) => handleCallArgsChange(e.target.value)}
                  placeholder={cleanParams.map((p) => `${p.name}=...`).join(', ') || 'no arguments'}
                  className="flex-1 bg-transparent text-emerald-300 focus:outline-none placeholder-slate-500 text-xs font-mono"
                />
                <span className="text-indigo-400 font-semibold">)</span>
              </div>
            </div>

            {/* 2. Structured Parameter Form */}
            <div className="space-y-3 flex-1 flex flex-col">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                  Parameters ({cleanParams.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Accepts Python literals: numbers, strings, True/False, None, [lists], dicts
                </span>
              </div>

              {cleanParams.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-white/[0.1] text-center text-xs text-slate-400 flex flex-col items-center justify-center">
                  <Code2 className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 stroke-1" />
                  <p className="font-medium text-slate-600 dark:text-slate-300">No Parameters Required</p>
                  <p className="text-[11px] mt-1">This function can be executed directly without arguments.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cleanParams.map((p) => {
                    const val = paramValues[p.name] ?? '';
                    return (
                      <div
                        key={p.name}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#070b14] space-y-1.5 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                              {p.name}
                            </span>
                            {p.annotation && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono border border-indigo-200/60 dark:border-indigo-800/60">
                                {p.annotation}
                              </span>
                            )}
                          </div>
                          {p.default !== null && p.default !== undefined && (
                            <span className="text-[10px] font-mono text-slate-400">
                              default: <code className="text-slate-600 dark:text-slate-300">{p.default}</code>
                            </span>
                          )}
                        </div>

                        <input
                          type="text"
                          value={val}
                          onChange={(e) => handleParamChange(p.name, e.target.value)}
                          placeholder={`Enter ${p.name}...`}
                          className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-[#050811] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Run Button Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-400">
                Executes inside PyTracer with AST sub-expression tracking & live logs.
              </div>
              <button
                onClick={() => runLiveExecution()}
                disabled={isRunning}
                className={`px-6 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md transition-all duration-150 cursor-pointer ${
                  isRunning
                    ? 'opacity-50 cursor-not-allowed bg-slate-300 dark:bg-slate-800 text-slate-500'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25 active:scale-95'
                }`}
              >
                {isRunning ? (
                  <>
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    <span>Tracing & Executing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Live Execution</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Column 2: Spacious Live Output & Logs Inspector (Right 45%) */}
        <div className="w-[480px] lg:w-[560px] xl:w-[620px] flex flex-col bg-slate-50/50 dark:bg-[#050811] overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090e1a] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-semibold">
              <button
                onClick={() => setOutputTab('result')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  outputTab === 'result'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                <span>Result</span>
              </button>
              <button
                onClick={() => setOutputTab('logs')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  outputTab === 'logs'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                <span>Logs ({logs.length})</span>
                {logs.some((l) => l.level === 'ERROR' || l.level === 'CRITICAL') && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            </div>

            {lastResult?.duration_ms && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-emerald-500" />
                {lastResult.duration_ms.toFixed(1)} ms
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {!lastResult && !isRunning && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <FlaskConical className="w-12 h-12 stroke-1 text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Ready for Execution</p>
                <p className="text-xs text-slate-400 max-w-[260px] mt-1.5">
                  Click 'Run Live Execution' to trace return values, variable modifications, and exception lines.
                </p>
              </div>
            )}

            {isRunning && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-indigo-500">
                <Activity className="w-9 h-9 animate-spin mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Executing with PyTracer...</p>
                <p className="text-xs text-slate-400 mt-1">Recording AST events, sub-expressions, and live logs</p>
              </div>
            )}

            {lastResult && outputTab === 'result' && (
              <div className="flex-1 p-5 overflow-y-auto flex flex-col space-y-4">
                {/* Result Status Card */}
                {lastResult.success ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs shrink-0">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Execution Succeeded (200 OK)</span>
                    </div>
                    <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1.5 flex items-center gap-2">
                      <span>{lastResult.events_count} events recorded</span>
                      <span>•</span>
                      <span>{lastResult.logs.length} logs captured</span>
                      <span>•</span>
                      <span>{lastResult.duration_ms?.toFixed(1)} ms</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs shadow-xs shrink-0">
                    <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400 text-sm">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      <span>Exception Trapped: {lastResult.error_type || 'Error'}</span>
                    </div>
                    <p className="mt-2 font-mono text-xs bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20 text-rose-800 dark:text-rose-200 break-words">
                      {lastResult.error_message || lastResult.error}
                    </p>
                    {lastResult.error_line && (
                      <div className="mt-2 text-[11px] font-mono text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <Bug className="w-3.5 h-3.5" />
                        <span>Failed at Line {lastResult.error_line}</span>
                        {lastResult.error_file && (
                          <span className="truncate text-slate-500">
                            ({lastResult.error_file.split(/[\\/]/).pop()})
                          </span>
                        )}
                      </div>
                    )}

                    <button
                      onClick={onNavigateToHunter}
                      className="mt-3.5 w-full py-2.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <span>🎯 Inspect Failure Line in Timeline</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Return Value Inspector - Full Height Flexible Container */}
                {lastResult.return_val && (
                  <div className="flex-1 flex flex-col min-h-[220px] space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                        Return Value
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setWrapReturnValue(!wrapReturnValue)}
                          className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1 ${
                            wrapReturnValue
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                              : 'text-slate-500 border-slate-200 dark:border-white/[0.08]'
                          }`}
                          title="Toggle word wrapping"
                        >
                          <WrapText className="w-3 h-3" />
                          <span>{wrapReturnValue ? 'Wrapped' : 'No Wrap'}</span>
                        </button>
                        <button
                          onClick={copyResult}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono text-xs overflow-auto shadow-inner select-text">
                      <pre
                        className={`${
                          wrapReturnValue ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                        } leading-relaxed`}
                      >
                        {lastResult.return_val}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Traceback Dropdown */}
                {lastResult.error_traceback && (
                  <div className="space-y-1.5 shrink-0">
                    <button
                      onClick={() => setShowTraceback((prev) => !prev)}
                      className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {showTraceback ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{showTraceback ? 'Hide Full Traceback' : 'Show Full Python Traceback'}</span>
                    </button>
                    {showTraceback && (
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-rose-300 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60 select-text">
                        <pre className="whitespace-pre-wrap">{lastResult.error_traceback}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Logs Peek */}
                {lastResult.logs.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.08] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      <Terminal className="w-4 h-4 text-indigo-500" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {lastResult.logs.length} logs captured
                      </span>
                    </div>
                    <button
                      onClick={() => setOutputTab('logs')}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>View Logs</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Console Logs Tab */}
            {lastResult && outputTab === 'logs' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#070b14] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        placeholder="Search logs by message or logger..."
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    {logs.length > 0 && (
                      <button
                        onClick={copyAllLogs}
                        className="px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs flex items-center gap-1 cursor-pointer shrink-0"
                        title="Copy all logs"
                      >
                        {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-mono overflow-x-auto pb-0.5">
                    {(['ALL', 'INFO', 'WARN', 'ERROR', 'STDOUT'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setLogLevelFilter(lvl)}
                        className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                          logLevelFilter === lvl
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.1] hover:border-slate-300'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
                  {filteredLogs.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
                      <Terminal className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 stroke-1" />
                      <p>{logs.length === 0 ? 'No logs emitted during this execution.' : 'No logs match current filter.'}</p>
                    </div>
                  ) : (
                    filteredLogs.map((log, idx) => {
                      const isError = log.level === 'ERROR' || log.level === 'CRITICAL';
                      const isWarn = log.level === 'WARNING' || log.level === 'WARN';
                      const isStdout = log.level === 'STDOUT' || log.level === 'STDERR';

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border text-xs leading-relaxed ${
                            isError
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                              : isWarn
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : isStdout
                              ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200'
                              : 'bg-slate-900/90 border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] opacity-75 mb-1 font-mono">
                            <span className="font-bold uppercase tracking-wider">{log.level}</span>
                            <span className="truncate max-w-[200px]" title={log.logger}>
                              {log.logger}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap break-words">{log.message}</div>
                          {log.exc_info && (
                            <pre className="mt-2 p-2 rounded bg-black/40 text-rose-300 text-[10px] overflow-x-auto whitespace-pre-wrap">
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
          </div>
        </div>
      </div>

      {/* Quick Function Switcher Modal */}
      {showFuncModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  placeholder="Switch function by name, class, param, or file..."
                  className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                />
              </div>
              <button
                onClick={() => setShowFuncModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredModalFunctions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-mono">
                  No matching functions found.
                </div>
              ) : (
                filteredModalFunctions.map((fn) => {
                  const isCur = selectedFunc?.name === fn.name && selectedFunc?.file_path === fn.file_path;
                  const isFnMethod = fn.name.includes('.');
                  const mName = isFnMethod ? fn.name.split('.').pop() : fn.name;
                  const cName = isFnMethod ? fn.name.split('.').slice(0, -1).join('.') : null;
                  const dFile = fn.file_path.split(/[\\/]/).pop();

                  return (
                    <div
                      key={`${fn.file_path}-${fn.name}`}
                      onClick={() => handleSelectFunction(fn)}
                      className={`p-3 rounded-xl cursor-pointer transition-all border flex items-center justify-between gap-3 ${
                        isCur
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/40'
                          : 'border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/40 hover:border-slate-200/80 dark:hover:border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {cName && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium">
                              {cName}
                            </span>
                          )}
                          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                            {mName}()
                          </span>
                          {fn.is_async && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
                              async
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-1 flex items-center gap-2">
                          <span>{dFile}:{fn.line}</span>
                          <span>•</span>
                          <span>{fn.params.filter((p) => p.name !== 'self' && p.name !== 'cls').length} params</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
