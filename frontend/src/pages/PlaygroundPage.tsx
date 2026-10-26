import React, { useState, useEffect } from 'react';
import {
  Play,
  FlaskConical,
  Code2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
  Bug,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Activity,
  Clock,
  Terminal
} from 'lucide-react';
import type { TraceSession, FunctionSignature, TestCase } from '../types';

interface PlaygroundPageProps {
  session: TraceSession;
  onSessionUpdated: (newSession: TraceSession) => void;
  onNavigateToHunter: () => void;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({
  session,
  onSessionUpdated,
  onNavigateToHunter,
}) => {
  const [functions, setFunctions] = useState<FunctionSignature[]>([]);
  const [selectedFunc, setSelectedFunc] = useState<FunctionSignature | null>(null);
  const [argsJson, setArgsJson] = useState<string>('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showTraceback, setShowTraceback] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    return_val: string;
    events_count: number;
    error: string | null;
    error_type?: string;
    error_message?: string;
    error_traceback?: string;
    duration_ms?: number;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Test cases dynamically populated from discovered project functions
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  // Fetch discoverable project functions from backend and populate dynamic test cases
  useEffect(() => {
    const fetchFuncs = async () => {
      try {
        const res = await fetch('/api/functions');
        if (res.ok) {
          const data: FunctionSignature[] = await res.json();
          if (data && data.length > 0) {
            setFunctions(data);
            setSelectedFunc(data[0]);
            if (data[0].sample_valid) {
              setArgsJson(JSON.stringify(data[0].sample_valid, null, 2));
            } else {
              setArgsJson(JSON.stringify(generateFallbackTemplate(data[0]), null, 2));
            }

            // Dynamically generate test cases for the user's project functions
            const dynamicCases: TestCase[] = [];
            data.slice(0, 8).forEach((fn) => {
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
            if (dynamicCases.length > 0) {
              setTestCases(dynamicCases);
            }
          }
        }
      } catch (err) {
        console.log('Using fallback default presets');
      }
    };
    fetchFuncs();
  }, []);

  const generateFallbackTemplate = (func: FunctionSignature): Record<string, any> => {
    const template: Record<string, any> = {};
    func.params.forEach((p) => {
      const ann = (p.annotation || '').toLowerCase();
      if (ann.includes('list')) {
        template[p.name] = [{ name: 'Sample Item', price: 50.0, qty: 1 }];
      } else if (ann.includes('int')) {
        template[p.name] = 30;
      } else if (ann.includes('float')) {
        template[p.name] = 25.5;
      } else if (ann.includes('bool')) {
        template[p.name] = false;
      } else {
        template[p.name] = p.default && p.default !== 'None' ? p.default.replace(/['"]/g, '') : 'sample_arg';
      }
    });
    return template;
  };

  const handleSelectFunction = (func: FunctionSignature) => {
    setSelectedFunc(func);
    if (func.sample_valid) {
      setArgsJson(JSON.stringify(func.sample_valid, null, 2));
    } else {
      setArgsJson(JSON.stringify(generateFallbackTemplate(func), null, 2));
    }
    setJsonError(null);
    setLastResult(null);
  };

  const loadValidPreset = () => {
    if (!selectedFunc) return;
    if (selectedFunc.sample_valid) {
      setArgsJson(JSON.stringify(selectedFunc.sample_valid, null, 2));
    } else {
      setArgsJson(JSON.stringify(generateFallbackTemplate(selectedFunc), null, 2));
    }
    setJsonError(null);
  };

  const loadInvalidPreset = () => {
    if (!selectedFunc) return;
    if (selectedFunc.sample_invalid) {
      setArgsJson(JSON.stringify(selectedFunc.sample_invalid, null, 2));
    } else {
      const badArgs: Record<string, any> = {};
      selectedFunc.params.forEach((p, idx) => {
        if (idx === 0) {
          badArgs[p.name] = 'wrong_string_trigger_exception';
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
          file_path: fn.file_path || session.files[0] || 'my_script.py',
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
          return_val: data.return_val,
          events_count: data.session?.events?.length || 0,
          error: data.error,
          error_type: data.error_type,
          error_message: data.error_message,
          error_traceback: data.error_traceback,
          duration_ms: elapsed,
        });
      } else {
        const err = await res.json();
        setLastResult({
          success: false,
          return_val: '',
          events_count: 0,
          error: err.error || 'Server error during execution',
          error_type: 'ServerError',
          duration_ms: elapsed,
        });
      }
    } catch (err: any) {
      setLastResult({
        success: false,
        return_val: '',
        events_count: 0,
        error: err.message,
        error_type: 'NetworkError',
        duration_ms: 0.1,
      });
    } finally {
      setIsRunning(false);
    }
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

  const saveCurrentAsTestCase = () => {
    try {
      const parsed = JSON.parse(argsJson);
      const isErr = Boolean(lastResult && !lastResult.success);
      const newTc: TestCase = {
        id: `tc-${Date.now()}`,
        name: `${selectedFunc?.name || 'func'} — ${isErr ? 'Fault Injection' : 'Custom Test'}`,
        function_name: selectedFunc?.name || 'function',
        file_path: selectedFunc?.file_path || '',
        args: parsed,
      };
      setTestCases((prev) => [...prev, newTc]);
    } catch (e) {
      setJsonError('Cannot save invalid JSON as test case.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 select-none transition-colors">
      {/* Top Banner Header */}
      <div className="h-14 px-6 bg-white/95 dark:bg-[#080d19]/95 border-b border-slate-200 dark:border-white/[0.08] backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <FlaskConical className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Interactive Code Sandbox & Fault Injection Runner</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                Live Isolated Tracer
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick any target function, test valid arguments or inject faulty values to trigger exceptions, and inspect the flow live.
            </p>
          </div>
        </div>

        {lastResult && (
          <button
            onClick={onNavigateToHunter}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all duration-150 cursor-pointer ${
              lastResult.success
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25 animate-pulse'
            }`}
          >
            {lastResult.success ? (
              <span>Open in Execution Timeline</span>
            ) : (
              <span>Inspect Error in Execution Timeline</span>
            )}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Split Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Function Selector & Argument Editor */}
        <div className="w-1/2 flex flex-col border-r border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#060911] overflow-hidden">
          {/* Function Selector Dropdown Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#080d19]/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Code2 className="w-4 h-4 text-indigo-500 shrink-0" />
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                Target Function:
              </label>
              <select
                value={selectedFunc?.name || ''}
                onChange={(e) => {
                  const f = functions.find((x) => x.name === e.target.value);
                  if (f) handleSelectFunction(f);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-[#050811] border border-slate-200 dark:border-white/[0.12] text-xs font-mono font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
              >
                {functions.map((f) => {
                  const fname = f.file_path ? f.file_path.split(/[\\/]/).pop() : 'script.py';
                  return (
                    <option key={`${f.file_path}-${f.name}`} value={f.name}>
                      {f.name}() — {fname} (Line {f.line})
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              onClick={() => selectedFunc && handleSelectFunction(selectedFunc)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Reset arguments template"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Function Signature & Parameters Documentation */}
          {selectedFunc && (
            <div className="px-4 py-3 bg-slate-50/50 dark:bg-[#090e1a]/40 border-b border-slate-200 dark:border-white/[0.08] text-xs font-mono">
              <div className="text-indigo-600 dark:text-indigo-400 font-semibold mb-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-purple-600 dark:text-purple-400">def</span>
                <span>{selectedFunc.name}(</span>
                {selectedFunc.params.map((p, idx) => (
                  <span key={p.name} className="text-slate-700 dark:text-slate-300">
                    <span className="text-indigo-500 dark:text-indigo-300">{p.name}</span>
                    {p.annotation ? <span className="text-emerald-600 dark:text-emerald-400">: {p.annotation}</span> : ''}
                    {p.default ? <span className="text-amber-600 dark:text-amber-400"> = {p.default}</span> : ''}
                    {idx < selectedFunc.params.length - 1 ? ', ' : ''}
                  </span>
                ))}
                <span>)</span>
              </div>
              {selectedFunc.docstring && (
                <div className="text-slate-500 dark:text-slate-400 font-sans text-[11px] italic mt-1">
                  "{selectedFunc.docstring}"
                </div>
              )}
            </div>
          )}

          {/* Argument JSON Editor & Preset Controls */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Invocation Arguments (JSON)
              </span>

              {/* Quick Input Presets: Valid vs Fault Injection */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={loadValidPreset}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[11px] font-medium transition-colors cursor-pointer"
                  title="Load verified valid inputs (Success test)"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Valid Inputs</span>
                </button>

                <button
                  onClick={loadInvalidPreset}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-[11px] font-medium transition-colors cursor-pointer"
                  title="Load faulty inputs to trigger an exception (Fault injection test)"
                >
                  <Bug className="w-3 h-3 text-rose-500" />
                  <span>Trigger Exception</span>
                </button>

                <button
                  onClick={saveCurrentAsTestCase}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                  title="Save current JSON as test case"
                >
                  <Plus className="w-3 h-3" />
                  <span>Save</span>
                </button>
              </div>
            </div>

            <div className="flex-1 relative flex flex-col">
              <textarea
                value={argsJson}
                onChange={(e) => handleJsonChange(e.target.value)}
                className={`flex-1 w-full p-3 rounded-lg font-mono text-xs leading-5 bg-slate-50 dark:bg-[#050811] border resize-none focus:outline-none select-text shadow-xs ${
                  jsonError
                    ? 'border-rose-500 text-rose-600 dark:text-rose-400 focus:ring-1 focus:ring-rose-500'
                    : 'border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                }`}
                placeholder='{\n  "arg1": "value"\n}'
              />
              {jsonError && (
                <div className="mt-1 text-[11px] text-rose-500 flex items-center gap-1 font-mono">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{jsonError}</span>
                </div>
              )}
            </div>

            {/* Run Button */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-sans">
                Press Run to execute in an isolated live tracer and inspect results.
              </span>

              <button
                onClick={() => runLiveExecution()}
                disabled={isRunning || Boolean(jsonError)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white font-semibold text-xs shadow-md shadow-indigo-600/25 flex items-center gap-2 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isRunning ? 'Tracing Execution...' : 'Run Live & Trace'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Execution Result & Saved Test Cases Bench */}
        <div className="w-1/2 flex flex-col bg-slate-50/70 dark:bg-[#080d19]/80 backdrop-blur-md overflow-hidden">
          {/* Top Half: Live Execution Output Box */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.08]">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              Latest Live Execution Output & Flow Analysis
            </span>

            {lastResult ? (
              <div
                className={`p-4 rounded-xl border font-mono text-xs shadow-xs transition-all ${
                  lastResult.success
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-400/50 dark:border-emerald-800/80'
                    : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-400/60 dark:border-rose-800/80'
                }`}
              >
                {/* Status Bar */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    {lastResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
                    )}
                    <span className="font-semibold text-slate-900 dark:text-slate-100 font-sans">
                      {lastResult.success ? 'Execution Finished Successfully' : 'Execution Raised Exception'}
                    </span>
                    {lastResult.error_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold border border-rose-500/30">
                        {lastResult.error_type}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-sans">
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-indigo-400" />
                      {lastResult.events_count} events
                    </span>
                    {lastResult.duration_ms !== undefined && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        {lastResult.duration_ms.toFixed(1)}ms
                      </span>
                    )}
                  </div>
                </div>

                {/* Return Value Display (Success Case) */}
                {lastResult.success && lastResult.return_val && (
                  <div className="bg-white dark:bg-[#050811] p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2 shadow-xs">
                    <div className="truncate flex-1">
                      <span className="text-slate-400 text-[11px] mr-2">Return Value:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                        {lastResult.return_val}
                      </span>
                    </div>
                    <button
                      onClick={copyResult}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title="Copy return value"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                {/* Exception & Error Breakdown (Error Case) */}
                {!lastResult.success && lastResult.error && (
                  <div className="space-y-2">
                    <div className="text-rose-700 dark:text-rose-300 text-xs bg-rose-500/15 p-3 rounded-lg border border-rose-500/30 flex flex-col gap-1">
                      <span className="font-bold text-[11px] uppercase tracking-wider text-rose-500">
                        Exception Message:
                      </span>
                      <span className="font-semibold font-mono">
                        {lastResult.error_message || lastResult.error}
                      </span>
                    </div>

                    {lastResult.error_traceback && (
                      <div className="rounded-lg border border-slate-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#050811]">
                        <button
                          onClick={() => setShowTraceback(!showTraceback)}
                          className="w-full px-3 py-1.5 bg-slate-100/70 dark:bg-slate-900/70 flex items-center justify-between text-left text-[11px] text-slate-600 dark:text-slate-300 font-sans cursor-pointer hover:bg-slate-200/50"
                        >
                          <span className="flex items-center gap-1 font-medium">
                            <Terminal className="w-3 h-3 text-slate-400" />
                            Python Exception Traceback
                          </span>
                          {showTraceback ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                        {showTraceback && (
                          <pre className="p-3 text-[11px] text-rose-600 dark:text-rose-400 overflow-x-auto leading-relaxed select-text font-mono max-h-48 overflow-y-auto">
                            {lastResult.error_traceback}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Flow Analysis Summary Footer */}
                <div className="mt-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between font-sans">
                  <span>
                    {lastResult.success
                      ? '✓ All AST sub-expressions evaluated without uncaught exceptions.'
                      : '⚠ Uncaught exception trapped by PyTracer and recorded in event timeline.'}
                  </span>
                  <button
                    onClick={onNavigateToHunter}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1"
                  >
                    <span>View Timeline</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl bg-slate-100/30 dark:bg-slate-900/20">
                Click "Run Live & Trace" to execute the target function with arguments and view output analysis.
              </div>
            )}
          </div>

          {/* Bottom Half: Pre-Configured Test Cases Bench */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Pre-Configured Test Scenarios ({testCases.length})
              </span>
              <span className="text-[11px] text-slate-400">Click any card to auto-populate and run</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {testCases.map((tc) => {
                const isErrorTest = tc.name.toLowerCase().includes('raises') || tc.name.toLowerCase().includes('fault');
                return (
                  <div
                    key={tc.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 group shadow-xs ${
                      isErrorTest
                        ? 'bg-rose-50/20 dark:bg-[#0d0912]/50 border-slate-200 dark:border-rose-900/20 hover:border-rose-400 dark:hover:border-rose-600'
                        : 'bg-white dark:bg-[#070b16] border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-indigo-600'
                    }`}
                  >
                    <div className="flex-1 truncate">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-xs text-slate-900 dark:text-slate-100 font-sans">
                          {tc.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {tc.function_name}()
                        </span>
                        {isErrorTest && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 font-semibold">
                            FAULT TEST
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {JSON.stringify(tc.args)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => loadTestCase(tc)}
                        disabled={isRunning}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-xs ${
                          isErrorTest
                            ? 'bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                            : 'bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                        }`}
                        title="Run this scenario live"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run</span>
                      </button>
                      <button
                        onClick={() => setTestCases((prev) => prev.filter((x) => x.id !== tc.id))}
                        className="p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity"
                        title="Delete scenario"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaygroundPage;
