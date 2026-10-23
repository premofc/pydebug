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
  ArrowRight
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
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    return_val: string;
    events_count: number;
    error: string | null;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Saved test cases
  const [testCases, setTestCases] = useState<TestCase[]>([
    {
      id: 'tc-1',
      name: 'VIP20 20% Discount Order',
      function_name: 'calculate_order_total',
      file_path: 'C:/Pydebug/my_script.py',
      args: {
        items: [
          { name: 'Wireless Mechanical Keyboard', price: 90.0, qty: 1 },
          { name: 'Ergonomic Mouse', price: 50.0, qty: 1 },
        ],
        discount_code: 'VIP20',
      },
      expected_return: '120.96',
    },
    {
      id: 'tc-2',
      name: 'SAVE10 10% Discount Order',
      function_name: 'calculate_order_total',
      file_path: 'C:/Pydebug/my_script.py',
      args: {
        items: [{ name: 'USB-C Cable 2m', price: 15.0, qty: 2 }],
        discount_code: 'SAVE10',
      },
      expected_return: '29.16',
    },
    {
      id: 'tc-3',
      name: 'No Discount Regular Order',
      function_name: 'calculate_order_total',
      file_path: 'C:/Pydebug/my_script.py',
      args: {
        items: [{ name: 'Gaming Headset', price: 75.0, qty: 1 }],
        discount_code: null,
      },
      expected_return: '81.0',
    },
  ]);

  // Fetch discoverable functions from backend
  useEffect(() => {
    const fetchFuncs = async () => {
      try {
        const res = await fetch('/api/functions');
        if (res.ok) {
          const data: FunctionSignature[] = await res.json();
          if (data && data.length > 0) {
            setFunctions(data);
            setSelectedFunc(data[0]);
            // Generate initial args template from parameters
            const template: Record<string, any> = {};
            data[0].params.forEach((p) => {
              if (p.annotation?.includes('list')) {
                template[p.name] = [{ name: 'Sample Item', price: 50.0, qty: 1 }];
              } else if (p.annotation?.includes('int')) {
                template[p.name] = 30;
              } else if (p.annotation?.includes('float')) {
                template[p.name] = 25.5;
              } else if (p.annotation?.includes('bool')) {
                template[p.name] = false;
              } else {
                template[p.name] = p.default !== 'None' && p.default ? p.default.replace(/['"]/g, '') : 'VIP20';
              }
            });
            setArgsJson(JSON.stringify(template, null, 2));
          }
        }
      } catch (err) {
        console.log('Using default function presets');
      }
    };
    fetchFuncs();
  }, []);

  const handleSelectFunction = (func: FunctionSignature) => {
    setSelectedFunc(func);
    const template: Record<string, any> = {};
    func.params.forEach((p) => {
      if (p.annotation?.includes('list')) {
        template[p.name] = [{ name: 'Sample Item', price: 50.0, qty: 1 }];
      } else if (p.annotation?.includes('int')) {
        template[p.name] = 30;
      } else if (p.annotation?.includes('float')) {
        template[p.name] = 25.5;
      } else if (p.annotation?.includes('bool')) {
        template[p.name] = false;
      } else {
        template[p.name] = p.default !== 'None' && p.default ? p.default.replace(/['"]/g, '') : 'VIP20';
      }
    });
    setArgsJson(JSON.stringify(template, null, 2));
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

  const runLiveExecution = async (overrideArgs?: Record<string, any>) => {
    if (!selectedFunc) return;
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

    try {
      const res = await fetch('/api/execute-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selectedFunc.file_path || session.files[0] || 'my_script.py',
          function_name: selectedFunc.name,
          args: parsedArgs,
        }),
      });

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
        });
      } else {
        const err = await res.json();
        setLastResult({
          success: false,
          return_val: '',
          events_count: 0,
          error: err.error || 'Server error during execution',
        });
      }
    } catch (err: any) {
      setLastResult({
        success: false,
        return_val: '',
        events_count: 0,
        error: err.message,
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
    setArgsJson(JSON.stringify(tc.args, null, 2));
    setJsonError(null);
    runLiveExecution(tc.args);
  };

  const saveCurrentAsTestCase = () => {
    try {
      const parsed = JSON.parse(argsJson);
      const newTc: TestCase = {
        id: `tc-${Date.now()}`,
        name: `Test #${testCases.length + 1} (${selectedFunc?.name || 'func'})`,
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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 select-none">
      {/* Top Banner */}
      <div className="h-14 px-6 bg-white dark:bg-[#090e1a]/90 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Interactive Code Sandbox & Live Runner</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                Live Isolated Tracer
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Provide your own arguments, execute in a live sandbox, and inspect the resulting trace line-by-line.
            </p>
          </div>
        </div>

        {lastResult && (
          <button
            onClick={onNavigateToHunter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-colors"
          >
            <span>Open in Execution Timeline</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Split Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Function Selector & Argument Editor */}
        <div className="w-1/2 flex flex-col border-r border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#060911] overflow-hidden">
          {/* Function Selector Header */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#090e1a]/90/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Code2 className="w-4 h-4 text-indigo-500" />
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Target Function:
              </label>
              <select
                value={selectedFunc?.name || ''}
                onChange={(e) => {
                  const f = functions.find((x) => x.name === e.target.value);
                  if (f) handleSelectFunction(f);
                }}
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-xs font-mono font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                {functions.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}() [Line {f.line}]
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => selectedFunc && handleSelectFunction(selectedFunc)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Reset arguments template"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Function Signature & Parameters Documentation */}
          {selectedFunc && (
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-white/[0.08] text-xs font-mono">
              <div className="text-indigo-600 dark:text-indigo-400 font-semibold mb-1">
                def {selectedFunc.name}(
                {selectedFunc.params.map((p, idx) => (
                  <span key={p.name}>
                    {p.name}
                    {p.annotation ? `: ${p.annotation}` : ''}
                    {p.default ? ` = ${p.default}` : ''}
                    {idx < selectedFunc.params.length - 1 ? ', ' : ''}
                  </span>
                ))}
                )
              </div>
              {selectedFunc.docstring && (
                <div className="text-slate-500 dark:text-slate-400 font-sans text-[11px] italic">
                  "{selectedFunc.docstring}"
                </div>
              )}
            </div>
          )}

          {/* Argument JSON Editor */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Invocation Arguments (JSON)
              </span>
              <button
                onClick={saveCurrentAsTestCase}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Save as Test Case</span>
              </button>
            </div>

            <div className="flex-1 relative flex flex-col">
              <textarea
                value={argsJson}
                onChange={(e) => handleJsonChange(e.target.value)}
                className={`flex-1 w-full p-3 rounded-lg font-mono text-xs leading-5 bg-slate-50 dark:bg-[#050811] border resize-none focus:outline-none select-text ${
                  jsonError
                    ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                    : 'border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 focus:border-indigo-500'
                }`}
                placeholder='{\n  "arg1": "value"\n}'
              />
              {jsonError && (
                <div className="mt-1 text-[11px] text-rose-500 flex items-center gap-1 font-mono">
                  <AlertCircle className="w-3 h-3" />
                  <span>{jsonError}</span>
                </div>
              )}
            </div>

            {/* Run Button */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Press Run to trace this function live with these arguments.
              </span>

              <button
                onClick={() => runLiveExecution()}
                disabled={isRunning || Boolean(jsonError)}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isRunning ? 'Tracing Execution...' : 'Run Live & Trace'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Execution Result & Saved Test Cases Bench */}
        <div className="w-1/2 flex flex-col bg-slate-50/70 dark:bg-[#090e1a]/90 backdrop-blur-md overflow-hidden">
          {/* Top Half: Live Execution Output Box */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.08]">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              Latest Live Execution Output
            </span>

            {lastResult ? (
              <div
                className={`p-3 rounded-lg border font-mono text-xs ${
                  lastResult.success
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                    : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {lastResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {lastResult.success ? 'Execution Finished Successfully' : 'Execution Failed'}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-sans">
                    {lastResult.events_count} events recorded
                  </span>
                </div>

                {lastResult.return_val && (
                  <div className="mt-2 bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="text-slate-400 mr-2">Return Value:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {lastResult.return_val}
                      </span>
                    </div>
                    <button
                      onClick={copyResult}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Copy return value"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                {lastResult.error && (
                  <div className="mt-2 text-rose-600 dark:text-rose-400 text-xs bg-rose-500/10 p-2 rounded border border-rose-500/20">
                    {lastResult.error}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-white/[0.08] rounded-lg">
                Click "Run Live & Trace" to execute the function and view return results.
              </div>
            )}
          </div>

          {/* Bottom Half: Test Cases Bench */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Saved Test Cases ({testCases.length})
              </span>
              <span className="text-[11px] text-slate-400">Click any test case to run it immediately</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {testCases.map((tc) => (
                <div
                  key={tc.id}
                  className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex-1 truncate">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-xs text-slate-900 dark:text-slate-100">
                        {tc.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {tc.function_name}()
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {JSON.stringify(tc.args)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => loadTestCase(tc)}
                      disabled={isRunning}
                      className="px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-medium border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 transition-colors"
                      title="Run this test case live"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Run</span>
                    </button>
                    <button
                      onClick={() => setTestCases((prev) => prev.filter((x) => x.id !== tc.id))}
                      className="p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity"
                      title="Delete test case"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaygroundPage;
