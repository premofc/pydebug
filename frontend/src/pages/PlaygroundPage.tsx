import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  FlaskConical,
  Code2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Bug,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Search,
  Activity,
  Clock,
  Terminal,
} from 'lucide-react';
import type { TraceSession, FunctionSignature, TestCase, LogEntry } from '../types';

interface PlaygroundPageProps {
  session: TraceSession;
  onSessionUpdated: (newSession: TraceSession) => void;
  onNavigateToHunter: () => void;
  // Function handed over from the Dashboard's "Try It Live" action.
  initialFunction?: FunctionSignature | null;
  onConsumeInitialFunction?: () => void;
}

const generateFallbackTemplate = (func: FunctionSignature): Record<string, any> => {
  const template: Record<string, any> = {};
  func.params.forEach((p) => {
    if (p.name === 'self' || p.name === 'cls') return;
    const ann = (p.annotation || '').toLowerCase();
    if (ann.includes('list')) {
      template[p.name] = ['item_1', 'item_2'];
    } else if (ann.includes('dict')) {
      template[p.name] = { key: 'value' };
    } else if (ann.includes('int')) {
      template[p.name] = 10;
    } else if (ann.includes('float')) {
      template[p.name] = 25.5;
    } else if (ann.includes('bool')) {
      template[p.name] = true;
    } else {
      template[p.name] = p.default && p.default !== 'None' ? p.default.replace(/['"]/g, '') : 'sample_value';
    }
  });
  return template;
};

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showScenarios, setShowScenarios] = useState<boolean>(false);
  const [argsJson, setArgsJson] = useState<string>(() => {
    if (initialFunction) {
      if (initialFunction.sample_valid && Object.keys(initialFunction.sample_valid).length > 0) {
        return JSON.stringify(initialFunction.sample_valid, null, 2);
      }
      return JSON.stringify(generateFallbackTemplate(initialFunction), null, 2);
    }
    return '{}';
  });
  const [jsonError, setJsonError] = useState<string | null>(null);
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
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  // Fetch discoverable project functions from backend
  useEffect(() => {
    const fetchFuncs = async () => {
      try {
        const res = await fetch('/api/functions');
        if (res.ok) {
          const data: FunctionSignature[] = await res.json();
          if (data && data.length > 0) {
            setFunctions(data);
            const target = activeFuncRef.current || initialFunction || selectedFunc;
            const matched = target
              ? data.find((f) => f.name === target.name && f.file_path === target.file_path) || target
              : data[0];
            if (matched) {
              activeFuncRef.current = matched;
              setSelectedFunc(matched);
              if (matched.sample_valid && Object.keys(matched.sample_valid).length > 0) {
                setArgsJson(JSON.stringify(matched.sample_valid, null, 2));
              } else {
                setArgsJson(JSON.stringify(generateFallbackTemplate(matched), null, 2));
              }
            }

            // Generate dynamic test scenarios from discovered project functions
            const dynamicCases: TestCase[] = [];
            data.slice(0, 10).forEach((fn) => {
              if (fn.sample_valid && Object.keys(fn.sample_valid).length > 0) {
                dynamicCases.push({
                  id: `tc-${fn.name}-valid`,
                  name: `${fn.name} (Valid Input)`,
                  function_name: fn.name,
                  file_path: fn.file_path,
                  args: fn.sample_valid,
                });
              }
              if (fn.sample_invalid && Object.keys(fn.sample_invalid).length > 0) {
                dynamicCases.push({
                  id: `tc-${fn.name}-err`,
                  name: `${fn.name} (Trigger Exception)`,
                  function_name: fn.name,
                  file_path: fn.file_path,
                  args: fn.sample_invalid,
                });
              }
            });
            setTestCases(dynamicCases);
          }
        }
      } catch (err) {
        console.error('Error fetching functions:', err);
      }
    };
    fetchFuncs();
  }, []);

  // When the user arrives via "Try It Live" on the Dashboard, pre-select that
  // function and load an editable argument template for it.
  useEffect(() => {
    if (!initialFunction) return;
    activeFuncRef.current = initialFunction;
    const matched = functions.find(
      (f) => f.name === initialFunction.name && f.file_path === initialFunction.file_path
    );
    handleSelectFunction(matched || initialFunction);
    onConsumeInitialFunction?.();
  }, [initialFunction, functions]);

  const filteredFunctions = useMemo(() => {
    if (!searchQuery.trim()) return functions;
    const q = searchQuery.toLowerCase();
    return functions.filter(
      (fn) =>
        fn.name.toLowerCase().includes(q) ||
        fn.file_path.toLowerCase().includes(q) ||
        fn.params.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [functions, searchQuery]);

  const handleSelectFunction = (func: FunctionSignature) => {
    activeFuncRef.current = func;
    setSelectedFunc(func);
    if (func.sample_valid && Object.keys(func.sample_valid).length > 0) {
      setArgsJson(JSON.stringify(func.sample_valid, null, 2));
    } else {
      setArgsJson(JSON.stringify(generateFallbackTemplate(func), null, 2));
    }
    setJsonError(null);
    setLastResult(null);
  };

  const loadValidPreset = () => {
    if (!selectedFunc) return;
    if (selectedFunc.sample_valid && Object.keys(selectedFunc.sample_valid).length > 0) {
      setArgsJson(JSON.stringify(selectedFunc.sample_valid, null, 2));
    } else {
      setArgsJson(JSON.stringify(generateFallbackTemplate(selectedFunc), null, 2));
    }
    setJsonError(null);
  };

  const loadInvalidPreset = () => {
    if (!selectedFunc) return;
    if (selectedFunc.sample_invalid && Object.keys(selectedFunc.sample_invalid).length > 0) {
      setArgsJson(JSON.stringify(selectedFunc.sample_invalid, null, 2));
    } else {
      const badArgs: Record<string, any> = {};
      selectedFunc.params.forEach((p, idx) => {
        if (p.name === 'self' || p.name === 'cls') return;
        if (idx === 0) {
          badArgs[p.name] = 'trigger_exception_invalid_arg';
        } else {
          badArgs[p.name] = null;
        }
      });
      setArgsJson(JSON.stringify(badArgs, null, 2));
    }
    setJsonError(null);
  };

  const handleJsonChange = (val: string) => {
    setArgsJson(val);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  const runLiveExecution = async (overrideArgs?: Record<string, any>, targetFuncOverride?: FunctionSignature) => {
    const fn = targetFuncOverride || selectedFunc;
    if (!fn) return;

    let parsedArgs = overrideArgs;
    if (!parsedArgs) {
      try {
        parsedArgs = JSON.parse(argsJson);
      } catch (e) {
        setJsonError('Please fix JSON syntax before running.');
        return;
      }
    }

    setIsRunning(true);
    setLastResult(null);
    setShowTraceback(false);
    const startTime = performance.now();

    try {
      const res = await fetch('/api/execute-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: fn.file_path,
          function_name: fn.name,
          args: parsedArgs,
        }),
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
      return (
        l.message.toLowerCase().includes(q) ||
        l.logger.toLowerCase().includes(q) ||
        (l.file && l.file.toLowerCase().includes(q))
      );
    });
  }, [logs, logLevelFilter, logSearchQuery]);

  const copyAllLogs = () => {
    const text = logs.map(l => `[${l.level}] ${l.logger}: ${l.message}`).join('\n');
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

  const loadTestCase = (tc: TestCase) => {
    const matchedFunc = functions.find((f) => f.name === tc.function_name);
    if (matchedFunc) {
      setSelectedFunc(matchedFunc);
    }
    setArgsJson(JSON.stringify(tc.args, null, 2));
    setJsonError(null);
    runLiveExecution(tc.args, matchedFunc);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Main 3-Column Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Discovered Functions List & Search */}
        <div className="w-80 border-r border-slate-200 dark:border-white/[0.08] flex flex-col bg-white dark:bg-[#090e1a] shrink-0">
          <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#0b1220]/50">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                Target Functions
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                {filteredFunctions.length}
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter functions..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-[#050811] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredFunctions.map((fn) => {
              const isSelected = selectedFunc?.name === fn.name && selectedFunc?.file_path === fn.file_path;
              const displayFile = fn.file_path.split(/[\\/]/).pop() || fn.file_path;

              return (
                <div
                  key={`${fn.file_path}-${fn.name}`}
                  onClick={() => handleSelectFunction(fn)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/40 dark:border-indigo-500/40 shadow-xs'
                      : 'border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/40 hover:border-slate-200/80 dark:hover:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {fn.name}()
                    </span>
                    {fn.is_async && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono font-medium">
                        async
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                    <span className="truncate" title={fn.file_path}>
                      {displayFile}:{fn.line}
                    </span>
                    <span>•</span>
                    <span>{fn.params.filter((p) => p.name !== 'self' && p.name !== 'cls').length} params</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: JSON Parameter Editor & Runner */}
        <div className="flex-1 border-r border-slate-200 dark:border-white/[0.08] flex flex-col bg-white dark:bg-[#090e1a] overflow-hidden">
          {/* Function Header */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#0b1220]/50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                    {selectedFunc?.name || 'Select Function'}()
                  </span>
                  {selectedFunc?.is_async && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
                      async coroutine
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 truncate" title={selectedFunc?.file_path}>
                  {selectedFunc?.file_path}
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={loadValidPreset}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Load verified valid parameters"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Valid Input</span>
                </button>
                <button
                  onClick={loadInvalidPreset}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Inject fault parameters to test exception handling and view exact traceback"
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>Inject Fault (Trigger Exception)</span>
                </button>
              </div>
            </div>

            {selectedFunc?.docstring && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-[#0b1220] p-2 rounded-lg border border-slate-200/80 dark:border-white/[0.06] line-clamp-2">
                {selectedFunc.docstring}
              </p>
            )}
          </div>

          {/* JSON Argument Editor */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                Function Arguments (JSON)
              </span>
              {jsonError ? (
                <span className="text-[11px] text-rose-500 font-mono flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Invalid JSON
                </span>
              ) : (
                <span className="text-[11px] text-emerald-500 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Valid JSON
                </span>
              )}
            </div>

            <div className="flex-1 rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden bg-slate-900 text-slate-100 flex flex-col shadow-inner">
              <textarea
                value={argsJson}
                onChange={(e) => handleJsonChange(e.target.value)}
                spellCheck={false}
                className="flex-1 p-3 font-mono text-xs leading-relaxed bg-transparent resize-none focus:outline-none selection:bg-indigo-600/40"
              />
            </div>

            {/* Run Button Footer */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-[11px] text-slate-400">
                Executes inside PyTracer with sub-expression monitoring & exception capture.
              </div>
              <button
                onClick={() => runLiveExecution()}
                disabled={isRunning || Boolean(jsonError)}
                className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all duration-150 cursor-pointer ${
                  isRunning || Boolean(jsonError)
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

        {/* Column 3: Live Output & Logs Inspector */}
        <div className="w-96 lg:w-[440px] flex flex-col bg-slate-50/50 dark:bg-[#050811] overflow-hidden shrink-0 border-l border-slate-200 dark:border-white/[0.08]">
          <div className="p-3 border-b border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090e1a] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-semibold">
              <button
                onClick={() => setOutputTab('result')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
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
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  outputTab === 'logs'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                <span>Logs ({logs.length})</span>
                {logs.some(l => l.level === 'ERROR' || l.level === 'CRITICAL') && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            </div>

            {lastResult?.duration_ms && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastResult.duration_ms.toFixed(1)} ms
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {!lastResult && !isRunning && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <FlaskConical className="w-10 h-10 stroke-1 text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs font-medium">Ready for Execution</p>
                <p className="text-[11px] text-slate-400 max-w-[200px] mt-1">
                  Click 'Run Live Execution' to trace return values, variable modifications, and exception lines.
                </p>
              </div>
            )}

            {isRunning && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-indigo-500">
                <Activity className="w-8 h-8 animate-spin mb-3" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Executing with PyTracer...</p>
                <p className="text-[11px] text-slate-400 mt-1">Recording AST events, sub-expressions, and live logs</p>
              </div>
            )}

            {lastResult && outputTab === 'result' && (
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {/* Result Status Card */}
                {lastResult.success ? (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Execution Succeeded (200 OK)</span>
                    </div>
                    <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 flex items-center gap-2">
                      <span>{lastResult.events_count} events recorded</span>
                      <span>•</span>
                      <span>{lastResult.logs.length} logs</span>
                      <span>•</span>
                      <span>{lastResult.duration_ms?.toFixed(1)} ms</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      <span>Exception Trapped: {lastResult.error_type || 'Error'}</span>
                    </div>
                    <p className="mt-1.5 font-mono text-xs bg-rose-500/10 p-2 rounded border border-rose-500/20 text-rose-800 dark:text-rose-200 break-words">
                      {lastResult.error_message || lastResult.error}
                    </p>
                    {lastResult.error_line && (
                      <div className="mt-2 text-[11px] font-mono text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <Bug className="w-3.5 h-3.5" />
                        <span>Failed at Line {lastResult.error_line}</span>
                        {lastResult.error_file && (
                          <span className="truncate text-slate-500">({lastResult.error_file.split(/[\\/]/).pop()})</span>
                        )}
                      </div>
                    )}

                    <button
                      onClick={onNavigateToHunter}
                      className="mt-3 w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <span>🎯 Inspect Failure Line in Timeline</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Return Value Preview */}
                {lastResult.success && lastResult.return_val && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>Return Value</span>
                      <button
                        onClick={copyResult}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono text-xs overflow-x-auto max-h-48">
                      <pre>{lastResult.return_val}</pre>
                    </div>
                  </div>
                )}

                {/* Traceback Dropdown */}
                {lastResult.error_traceback && (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => setShowTraceback((prev) => !prev)}
                      className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {showTraceback ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{showTraceback ? 'Hide Full Traceback' : 'Show Full Python Traceback'}</span>
                    </button>
                    {showTraceback && (
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-rose-300 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60 select-text">
                        <pre className="whitespace-pre-wrap">{lastResult.error_traceback}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Logs Peek if logs exist */}
                {lastResult.logs.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <Terminal className="w-4 h-4 text-indigo-500" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{lastResult.logs.length} logs captured</span>
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

                {/* Inspect in Timeline Button */}
                {lastResult.events_count > 0 && (
                  <button
                    onClick={onNavigateToHunter}
                    className="w-full py-2.5 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800/60 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span>View All {lastResult.events_count} Events in Timeline</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {lastResult && outputTab === 'logs' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search & Level Filters Toolbar */}
                <div className="p-2.5 border-b border-slate-200 dark:border-white/[0.08] bg-slate-100/50 dark:bg-[#090e1a]/60 flex flex-col gap-2 shrink-0">
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

                  {/* Level Pills */}
                  <div className="flex items-center gap-1 text-[11px] font-mono overflow-x-auto pb-0.5">
                    {(['ALL', 'INFO', 'WARN', 'ERROR', 'STDOUT'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setLogLevelFilter(lvl)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
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

                {/* Log Entries List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
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
                          className={`p-2.5 rounded-lg border transition-all ${
                            isError
                              ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                              : 'bg-white dark:bg-slate-900/90 border-slate-200 dark:border-white/[0.08]'
                          }`}
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
          </div>
        </div>
      </div>

      {/* Bottom Panel: Dynamic Test Scenarios (Collapsible) */}
      {testCases.length > 0 && (
        <div className={`border-t border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-md px-4 py-2.5 flex flex-col shrink-0 select-none transition-all ${
          showScenarios ? 'h-36' : 'h-11'
        }`}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowScenarios((v) => !v)}
              className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Pre-Configured Test Scenarios ({testCases.length})</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showScenarios ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-[11px] text-slate-400">
              {showScenarios ? 'Click any card to auto-populate and run execution' : 'Click to expand test scenarios'}
            </span>
          </div>

          {showScenarios && (
          <div className="flex-1 flex gap-2.5 overflow-x-auto pb-1 mt-2">
            {testCases.map((tc) => {
              const isError = tc.id.includes('-err');
              return (
                <div
                  key={tc.id}
                  onClick={() => loadTestCase(tc)}
                  className={`min-w-[240px] max-w-[280px] p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between shrink-0 ${
                    isError
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/40 hover:border-rose-500/60'
                      : 'bg-slate-50 dark:bg-[#0c1322] border-slate-200/80 dark:border-white/[0.08] hover:border-indigo-500/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                        {tc.name}
                      </span>
                      {isError ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          FAULT
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          VALID
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                      {tc.function_name}()
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                    <span>Run Scenario</span>
                    <Play className="w-2.5 h-2.5 fill-current" />
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}
    </div>
  );
};
