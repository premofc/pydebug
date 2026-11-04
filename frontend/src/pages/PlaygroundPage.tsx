import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { TraceSession, FunctionSignature, FunctionInspectionResponse } from '../types';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showFunctionPicker, setShowFunctionPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [callArgsStr, setCallArgsStr] = useState('');
  const [activeTab, setActiveTab] = useState<'exec' | 'refs'>('exec');
  const [refSubTab, setRefSubTab] = useState<'references' | 'implementation'>('references');
  const [outputTab, setOutputTab] = useState<'result' | 'logs'>('result');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [isLoadingFunctions, setIsLoadingFunctions] = useState(true);
  const [functionsError, setFunctionsError] = useState<string | null>(null);

  // Interactive parameter values state: name -> raw input string
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    return_val: string;
    events_count: number;
    error: string | null;
    error_type?: string;
    error_message?: string;
    error_traceback?: string;
    error_line?: number;
    duration_ms?: number;
    logs: NonNullable<TraceSession['logs']>;
  } | null>(null);

  // References and inspection data
  const [inspectionData, setInspectionData] = useState<FunctionInspectionResponse | null>(null);
  const [isLoadingInspection, setIsLoadingInspection] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [refSearchQuery, setRefSearchQuery] = useState<string>('');
  const [copiedResult, setCopiedResult] = useState<boolean>(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const functionPickerTriggerRef = useRef<HTMLButtonElement>(null);

  // Resizer state for left pane
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(260);
  const isResizingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(260);
  const stopResizeRef = useRef<(() => void) | null>(null);

  // Initialize parameters when function selected
  const buildCallString = useCallback((params: FunctionSignature['params'], values: Record<string, string>) =>
    params
      .filter((param) => param.name !== 'self' && param.name !== 'cls')
      .flatMap((param) => {
        const value = values[param.name]?.trim();
        return value ? [`${param.name}=${value}`] : [];
      })
      .join(', '), []);

  const initParamsForFunc = useCallback((fn: FunctionSignature) => {
    const initialParams: Record<string, string> = {};
    fn.params.forEach((p) => {
      if (p.name === 'self' || p.name === 'cls') return;
      if (p.default !== undefined && p.default !== null) {
        initialParams[p.name] = String(p.default);
      } else {
        if (fn.sample_valid?.[p.name] !== undefined) {
          const sample = fn.sample_valid[p.name];
          initialParams[p.name] = JSON.stringify(sample);
        } else if (p.annotation?.toLowerCase().includes('int')) initialParams[p.name] = '5';
        else if (p.annotation?.toLowerCase().includes('float')) initialParams[p.name] = '1.0';
        else if (p.annotation?.toLowerCase().includes('str')) initialParams[p.name] = '"active"';
        else if (p.annotation?.toLowerCase().includes('bool')) initialParams[p.name] = 'True';
        else initialParams[p.name] = '';
      }
    });
    setParamValues(initialParams);
    setCallArgsStr(buildCallString(fn.params, initialParams));
  }, [buildCallString]);

  // Fetch discoverable project functions from backend
  useEffect(() => {
    let isMounted = true;
    const fetchFuncs = async () => {
      setIsLoadingFunctions(true);
      setFunctionsError(null);
      try {
        const res = await fetch('/api/functions');
        if (!res.ok) throw new Error(`Unable to load workspace functions (${res.status}).`);
        const response: unknown = await res.json();
        if (!Array.isArray(response)) throw new Error('The function list response was invalid.');
        const data = (response as unknown[]).filter((item): item is FunctionSignature =>
          !!item && typeof item === 'object' &&
          typeof (item as FunctionSignature).name === 'string' &&
          typeof (item as FunctionSignature).file_path === 'string' &&
          Array.isArray((item as FunctionSignature).params) &&
          (item as FunctionSignature).params.every((param) =>
            !!param && typeof param.name === 'string' &&
            (param.annotation == null || typeof param.annotation === 'string')
          )
        );
        if (isMounted) {
          if (data && data.length > 0) {
            setFunctions(data);
            const matched = initialFunction
              ? data.find((f) => f.name === initialFunction.name && f.file_path === initialFunction.file_path) || data[0]
              : data[0];
            if (matched) {
              setSelectedFunc(matched);
              initParamsForFunc(matched);
            }
            if (initialFunction) onConsumeInitialFunction?.();
          } else {
            setFunctions([]);
            if (initialFunction) {
              setSelectedFunc(initialFunction);
              initParamsForFunc(initialFunction);
              onConsumeInitialFunction?.();
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setFunctionsError(err instanceof Error ? err.message : 'Unable to load workspace functions.');
          if (initialFunction) {
            setSelectedFunc(initialFunction);
            initParamsForFunc(initialFunction);
            onConsumeInitialFunction?.();
          }
        }
      } finally {
        if (isMounted) setIsLoadingFunctions(false);
      }
    };
    fetchFuncs();
    return () => { isMounted = false; };
  }, [initialFunction, initParamsForFunc, onConsumeInitialFunction]);

  // Fetch source code implementation and workspace callers whenever selected function changes
  useEffect(() => {
    if (!selectedFunc) return;

    let isMounted = true;
    const fetchInspection = async () => {
      setInspectionData(null);
      setInspectionError(null);
      setIsLoadingInspection(true);
      try {
        const url = `/api/function-inspection?file_path=${encodeURIComponent(selectedFunc.file_path)}&func_name=${encodeURIComponent(selectedFunc.name)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Unable to inspect this function (${res.status}).`);
        const response: unknown = await res.json();
        if (!response || typeof response !== 'object') throw new Error('The function inspection response was invalid.');
        const raw = response as Partial<FunctionInspectionResponse>;
        const references = Array.isArray(raw.references) ? raw.references.filter((reference) =>
          !!reference && typeof reference.file_path === 'string' &&
          typeof reference.rel_path === 'string' && typeof reference.snippet === 'string' &&
          typeof reference.caller_context === 'string' && Number.isFinite(reference.line)
        ) : [];
        const implementation = raw.implementation && typeof raw.implementation.code === 'string'
          ? raw.implementation
          : null;
        if (isMounted) setInspectionData({
          func_name: typeof raw.func_name === 'string' ? raw.func_name : selectedFunc.name,
          file_path: typeof raw.file_path === 'string' ? raw.file_path : selectedFunc.file_path,
          rel_path: typeof raw.rel_path === 'string' ? raw.rel_path : selectedFunc.file_path,
          implementation,
          references,
          total_references: references.length,
        });
      } catch (err) {
        if (isMounted) setInspectionError(err instanceof Error ? err.message : 'Unable to inspect this function.');
      } finally {
        if (isMounted) setIsLoadingInspection(false);
      }
    };

    fetchInspection();
    return () => {
      isMounted = false;
    };
  }, [selectedFunc]);

  useEffect(() => () => stopResizeRef.current?.(), []);

  // Handle Resizer Mouse Events
  const handleMouseDown = (e: React.MouseEvent) => {
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftPaneWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(180, Math.min(500, startWidthRef.current + dx));
      setLeftPaneWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
      stopResizeRef.current = null;
    };
    stopResizeRef.current = onMouseUp;

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onMouseUp);
  };

  const handleDoubleClickResizer = () => {
    setLeftPaneWidth(260);
  };

  const handleRunExecution = async () => {
    if (!selectedFunc) return;
    setIsRunning(true);
    setLastResult(null);
    const startTime = performance.now();

    try {
      const payload: Record<string, unknown> = {
        file_path: selectedFunc.file_path,
        function_name: selectedFunc.name,
        ...(callArgsStr.trim()
          ? { call_expr: `${selectedFunc.name}(${callArgsStr})` }
          : { args: {} }),
      };

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
        const logs = Array.isArray(data.session?.logs) ? data.session.logs : [];
        setLastResult({
          success: data.success === true,
          return_val: data.return_val || '',
          events_count: data.session?.events?.length || 0,
          error: data.error || null,
          error_type: data.error_type,
          error_message: data.error_message,
          error_traceback: data.error_traceback,
          error_line: data.error_line,
          duration_ms: elapsed,
          logs,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setLastResult({
          success: false,
          return_val: '',
          events_count: 0,
          error: err.error || 'Server error during execution',
          error_type: err.error_type || 'ServerError',
          error_message: err.error_message || err.error,
          error_traceback: err.error_traceback,
          error_line: err.error_line,
          duration_ms: elapsed,
          logs: [],
        });
      }
    } catch (err: unknown) {
      setLastResult({
        success: false,
        return_val: '',
        events_count: 0,
        error: err instanceof Error ? err.message : 'The execution request failed.',
        error_type: 'NetworkError',
        duration_ms: Math.max(0.1, performance.now() - startTime),
        logs: [],
      });
    } finally {
      setIsRunning(false);
    }
  };

  const copyResult = async () => {
    if (!lastResult) return;
    const textToCopy = lastResult.return_val || lastResult.error || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedResult(true);
      window.setTimeout(() => setCopiedResult(false), 1500);
    } catch {
      setClipboardError('Clipboard access is unavailable. Select and copy the result instead.');
    }
  };

  const filteredFunctions = useMemo(() => {
    if (!searchQuery.trim()) return functions;
    const q = searchQuery.toLowerCase().trim();
    return functions.filter(
      (fn) =>
        fn.name.toLowerCase().includes(q) ||
        fn.file_path.toLowerCase().includes(q)
    );
  }, [functions, searchQuery]);

  const cleanParams = useMemo(() => {
    if (!selectedFunc || !Array.isArray(selectedFunc.params)) return [];
    return selectedFunc.params.filter((p) => p.name !== 'self' && p.name !== 'cls');
  }, [selectedFunc]);

  const filteredCallers = useMemo(() => {
    if (!inspectionData?.references) return [];
    if (!refSearchQuery.trim()) return inspectionData.references;
    const q = refSearchQuery.toLowerCase();
    return inspectionData.references.filter(
      (r) => r.file_path.toLowerCase().includes(q) || r.snippet.toLowerCase().includes(q)
    );
  }, [inspectionData, refSearchQuery]);

  const filteredPickerFunctions = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return functions;
    return functions.filter((fn) => fn.name.toLowerCase().includes(query) || fn.file_path.toLowerCase().includes(query));
  }, [functions, pickerQuery]);

  const filteredLogs = useMemo(() => {
    const query = logSearchQuery.trim().toLowerCase();
    return (lastResult?.logs || []).filter((log) =>
      !!log && typeof log.message === 'string' && typeof log.logger === 'string' &&
      (!query || log.message.toLowerCase().includes(query) || log.logger.toLowerCase().includes(query))
    );
  }, [lastResult, logSearchQuery]);

  const chooseFunction = (fn: FunctionSignature) => {
    setSelectedFunc(fn);
    initParamsForFunc(fn);
    setLastResult(null);
    setShowFunctionPicker(false);
    setPickerQuery('');
    window.setTimeout(() => functionPickerTriggerRef.current?.focus(), 0);
  };

  const closeFunctionPicker = () => {
    setShowFunctionPicker(false);
    window.setTimeout(() => functionPickerTriggerRef.current?.focus(), 0);
  };

  const handlePickerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeFunctionPicker();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('input, button:not([disabled])');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="sandbox-split-grid w-full h-full">
      {/* Column 1: Left Pane (Callables List) */}
      <div className="sandbox-left-pane" style={{ width: `${leftPaneWidth}px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
            Callables ({functions.length})
          </h2>
          <button ref={functionPickerTriggerRef} type="button" className="vcr-btn" onClick={() => { setPickerQuery(''); setShowFunctionPicker(true); }}>
            Switch Function
          </button>
        </div>

        {functionsError && <p role="alert" className="sandbox-message error">{functionsError}</p>}
        {isLoadingFunctions && <p role="status" className="sandbox-message">Loading workspace functions…</p>}

        {/* Filter input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter functions..."
          style={{
            padding: '4px 8px',
            borderRadius: '5px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            marginBottom: '4px',
            width: '100%',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
          {!isLoadingFunctions && !functionsError && filteredFunctions.length === 0 && (
            <p className="sandbox-message">
              {functions.length ? 'No functions match this filter.' : 'No workspace functions were found.'}
            </p>
          )}
          {filteredFunctions.map((fn) => {
            const isSelected = selectedFunc?.name === fn.name && selectedFunc?.file_path === fn.file_path;
            const shortFile = fn.file_path.split(/[\\/]/).pop() || fn.file_path;
            return (
              <button
                type="button"
                key={`${fn.file_path}-${fn.name}`}
                className={`func-card gloss-card ${isSelected ? 'border-[var(--primary)] shadow-sm' : ''}`}
                aria-pressed={isSelected}
                style={{
                  padding: '8px 10px',
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--primary)' : undefined,
                  background: isSelected ? 'var(--primary-subtle)' : undefined,
                  textAlign: 'left',
                }}
                onClick={() => chooseFunction(fn)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>
                    {fn.name}
                  </div>
                  {fn.is_async && (
                    <span className="tag-badge" style={{ background: 'var(--emerald-subtle)', color: 'var(--emerald)' }}>
                      async
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                  {shortFile}:{fn.line}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* VS Code Draggable Resizer Bar */}
      <div
        className="resizer-v"
        role="separator"
        aria-label="Resize callable list"
        aria-orientation="vertical"
        aria-valuemin={180}
        aria-valuemax={500}
        aria-valuenow={Math.round(leftPaneWidth)}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClickResizer}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setLeftPaneWidth((width) => Math.max(180, Math.min(500, width + (event.key === 'ArrowLeft' ? -16 : 16))));
          } else if (event.key === 'Home') setLeftPaneWidth(180);
          else if (event.key === 'End') setLeftPaneWidth(500);
        }}
        title="Drag to resize pane • Double-click to reset"
      />

      {/* Column 2: Right Stage (Invocation & References) */}
      <div className="sandbox-stage">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
          <button
            type="button"
            className={`vcr-btn ${activeTab === 'exec' ? 'vcr-btn-primary' : ''}`}
            onClick={() => setActiveTab('exec')}
          >
            Interactive Invocation
          </button>
          <button
            type="button"
            className={`vcr-btn ${activeTab === 'refs' ? 'vcr-btn-primary' : ''}`}
            onClick={() => setActiveTab('refs')}
          >
            References & Code ({inspectionData?.references?.length || 0})
          </button>
        </div>

        {/* Tab 1: Interactive Invocation */}
        {activeTab === 'exec' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {selectedFunc && (
              <div>
                <h1 style={{ fontSize: '17px', fontWeight: 750, margin: '0 0 4px' }}>{selectedFunc.name}()</h1>
                {selectedFunc.docstring && <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>{selectedFunc.docstring}</p>}
              </div>
            )}
            {/* Function Header & Parameters Card */}
            <div className="gloss-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>Python Invocation Expression <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>· Parameters ({cleanParams.length})</span></div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    {selectedFunc?.file_path.split(/[\\/]/).pop()}:{selectedFunc?.line} • {cleanParams.length} param{cleanParams.length === 1 ? '' : 's'}
                  </div>
                </div>

                <button
                  type="button"
                  className="vcr-btn vcr-btn-primary"
                  style={{ height: '32px', padding: '0 16px', fontSize: '11.5px' }}
                  onClick={handleRunExecution}
                  disabled={!selectedFunc || isRunning}
                >
                  {isRunning ? 'Executing...' : 'Run Live Execution'}
                </button>
              </div>

              {cleanParams.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '6px 0' }}>
                  No required parameters. Function executes with default arguments.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cleanParams.map((p) => (
                    <div key={p.name} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label htmlFor={`param-${p.name}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', width: '120px', color: 'var(--text-secondary)' }}>
                        {p.name}:
                      </label>
                      <input
                        id={`param-${p.name}`}
                        aria-label={p.name}
                        type="text"
                        value={paramValues[p.name] ?? ''}
                        placeholder={`Enter ${p.name}...`}
                        onChange={(e) => {
                          const nextValues = { ...paramValues, [p.name]: e.target.value };
                          setParamValues(nextValues);
                          setCallArgsStr(buildCallString(selectedFunc?.params || [], nextValues));
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11.5px',
                          width: '240px',
                        }}
                      />
                      {p.annotation && (
                        <span className="tag-badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: 'var(--sky)' }}>
                          {p.annotation}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <label htmlFor="python-call-args" className="sandbox-call-label">
                Call arguments
                <input
                  id="python-call-args"
                  className="sandbox-call-input"
                  type="text"
                  value={callArgsStr}
                  placeholder="amount=500, rate=0.2"
                  onChange={(event) => setCallArgsStr(event.target.value)}
                />
              </label>
            </div>

            {/* Execution Result Card */}
            <div className="gloss-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: lastResult ? (lastResult.success ? 'var(--emerald)' : 'var(--rose)') : 'var(--emerald)',
                  }}
                >
                  {lastResult
                    ? lastResult.success
                      ? `Execution Succeeded (${lastResult.duration_ms?.toFixed(2)}ms)`
                      : `Exception Trapped: ${lastResult.error_type || 'Error'}`
                    : 'Ready to execute'}
                </span>

                <button
                  type="button"
                  className="vcr-btn"
                  style={{ height: '22px', padding: '0 8px', fontSize: '10px' }}
                  onClick={copyResult}
                  disabled={!lastResult}
                >
                  {copiedResult ? 'Copied' : 'Copy result'}
                </button>
              </div>

              {lastResult && (
                <div className="sandbox-result-actions">
                  <button type="button" className="vcr-btn" onClick={() => setOutputTab('result')}>Result</button>
                  <button type="button" className="vcr-btn" onClick={() => setOutputTab('logs')}>View Logs ({lastResult.logs.length})</button>
                  <button type="button" className="vcr-btn" onClick={onNavigateToHunter}>View in Timeline Replay</button>
                </div>
              )}
              {lastResult?.error_line && <div className="sandbox-result-actions"><span className="sandbox-message error">Failed at Line {lastResult.error_line}</span><button type="button" className="vcr-btn" onClick={onNavigateToHunter}>🎯 Inspect Failure Line in Timeline Replay</button></div>}
              {clipboardError && <p role="status" className="sandbox-message">{clipboardError}</p>}

              {outputTab === 'result' && <pre
                style={{
                  background: 'var(--bg-code)',
                  padding: '12px',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: lastResult?.success === false ? 'var(--rose)' : 'var(--emerald)',
                  overflowX: 'auto',
                  maxHeight: '320px',
                }}
              >
                {lastResult
                  ? lastResult.return_val || lastResult.error_traceback || lastResult.error || 'No return value'
                  : 'Run a function to capture its return value, logs, and execution trace.'}
              </pre>}
              {lastResult && outputTab === 'logs' && (
                <div className="sandbox-log-list">
                  <input
                    type="search"
                    aria-label="Search logs by message or logger"
                    placeholder="Search logs by message or logger"
                    value={logSearchQuery}
                    onChange={(event) => setLogSearchQuery(event.target.value)}
                  />
                  {filteredLogs.length === 0 ? <p>No logs match this filter.</p> : filteredLogs.map((log, index) => (
                    <div key={`${log.timestamp}-${log.logger}-${index}`} className="sandbox-log-row">
                      <strong>{log.level}</strong><span>{log.logger}</span><span>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: References & Usages */}
        {activeTab === 'refs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {inspectionError && <p role="alert" className="sandbox-message error">{inspectionError}</p>}
            {isLoadingInspection && <p role="status" className="sandbox-message">Loading references and source…</p>}
            <div className="sandbox-result-actions">
              <button type="button" className="vcr-btn" onClick={() => setRefSubTab('references')}>Callers & Usages</button>
              <button type="button" className="vcr-btn" onClick={() => setRefSubTab('implementation')}>Source Implementation</button>
            </div>
            {refSubTab === 'references' && <div className="gloss-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>
                  Callers & Usages ({inspectionData?.references?.length || 0})
                </div>
                <input
                  type="text"
                  value={refSearchQuery}
                  onChange={(e) => setRefSearchQuery(e.target.value)}
                  placeholder="Filter callers..."
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '10.5px',
                    width: '180px',
                  }}
                />
              </div>

              {filteredCallers.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '8px 0' }}>
                  No active caller references recorded for this callable.
                </div>
              ) : (
                filteredCallers.map((ref) => (
                  <div key={`${ref.file_path}-${ref.line}`} className="variable-card-box" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        {ref.rel_path}
                      </span>
                      <span className="tag-badge" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
                        :L{ref.line}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10.5px' }}>{ref.caller_context}</div>
                    <pre style={{ color: 'var(--text-secondary)', fontSize: '10.5px', overflowX: 'auto' }}>{ref.snippet}</pre>
                  </div>
                ))
              )}
            </div>}

            {/* Source Implementation Preview */}
            {refSubTab === 'implementation' && inspectionData?.implementation && (
              <div className="gloss-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Source Implementation</span>
                <pre
                  style={{
                    background: 'var(--bg-code)',
                    padding: '10px',
                    borderRadius: '6px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-primary)',
                    overflowX: 'auto',
                    maxHeight: '260px',
                  }}
                >
                  {inspectionData.implementation.code}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
      {showFunctionPicker && (
        <div className="sandbox-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFunctionPicker(); }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="function-picker-title"
            className="sandbox-function-dialog"
            onKeyDown={handlePickerKeyDown}
          >
            <div className="sandbox-dialog-heading">
              <h2 id="function-picker-title">Switch Function</h2>
              <button type="button" className="vcr-btn" onClick={closeFunctionPicker} aria-label="Close function picker">Close</button>
            </div>
            <input
              autoFocus
              type="search"
              aria-label="Search functions"
              placeholder="Switch function by name, class, parameter, or file…"
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.target.value)}
            />
            <div className="sandbox-function-options">
              {filteredPickerFunctions.length === 0 ? <p>No functions match this search.</p> : filteredPickerFunctions.map((fn) => (
                <button
                  type="button"
                  key={`${fn.file_path}-${fn.name}`}
                  onClick={() => chooseFunction(fn)}
                  aria-current={selectedFunc?.name === fn.name && selectedFunc.file_path === fn.file_path ? 'true' : undefined}
                >
                  <strong>{fn.name}()</strong><span>{fn.file_path.split(/[\\/]/).pop()}:{fn.line}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaygroundPage;
