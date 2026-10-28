import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Eye,
  FlaskConical,
  Zap,
  Search,
  RefreshCw,
  Terminal,
  Cpu,
  Radio,
  Code2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Activity,
  Layers,
  Clock,
  Send,
  Sparkles,
  CircleX,
  SlidersHorizontal,
} from 'lucide-react';
import type { FunctionSignature, SessionSummary, TraceSession } from '../types';
import { buildCallRecords } from '../utils/calls';
import type { CallRecord } from '../utils/calls';

interface DashboardPageProps {
  onSelectSession: (sessionId: string, targetView: 'birdseye' | 'hunter' | 'playground') => void;
  aiConfig?: { provider: string; base_url: string; model?: string } | null;
  onTryFunction?: (func: FunctionSignature) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onSelectSession, aiConfig, onTryFunction }) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [functions, setFunctions] = useState<FunctionSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<TraceSession | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedFunc, setSelectedFunc] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllFuncs, setShowAllFuncs] = useState(false);

  const listenerPort = window.location.port || '8899';
  const aiHost = useMemo(() => {
    try {
      return aiConfig?.base_url ? new URL(aiConfig.base_url).host : 'not configured';
    } catch {
      return aiConfig?.base_url || 'not configured';
    }
  }, [aiConfig]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data: SessionSummary[] = await res.json();
        // Stable state: only update when the list actually changed so polls
        // can't churn re-renders or yank the expanded panel.
        let next: SessionSummary[] = data;
        if (!Array.isArray(data)) return;
        // Dedupe by id: a session posted twice (stream snapshot + final flush)
        // must not render two accordion rows for the same trace.
        next = data.filter((item, i) => data.findIndex((x) => x.id === item.id) === i);
        setSessions((prev) => (
          prev.length === next.length && prev.every((p, i) => p.id === next[i].id) ? prev : next
        ));
        if (!expandedIdRef.current) {
          setExpandedId(next[0]?.id ?? null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Latest expansion without re-creating the poll closure on every click
  const expandedIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  const fetchFunctions = async () => {
    try {
      const res = await fetch('/api/functions');
      if (res.ok) setFunctions(await res.json());
    } catch (err) {
      console.error('Failed to fetch discovered functions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchFunctions();
    const interval = setInterval(fetchSessions, 2500);
    return () => clearInterval(interval);
  }, []);

  // Load the full trace when a summary row is expanded
  useEffect(() => {
    if (!expandedId) return;
    fetch(`/api/session?id=${expandedId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TraceSession | null) => {
        if (!data) return;
        setExpandedSession((prev) => {
          // Keep in-panel selections when re-rendering the same session
          if (prev?.id !== data.id) {
            setSelectedCallId(null);
            setSelectedFunc(null);
          }
          return data;
        });
      })
      .catch((err) => console.error('Failed to load session:', err));
  }, [expandedId]);

  const handleSimulate = async (scenario: string) => {
    setSimulating(scenario);
    try {
      const res = await fetch('/api/simulate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchSessions();
        if (data.session?.id) onSelectSession(data.session.id, 'hunter');
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(null);
    }
  };

  // KPI calculations
  const totalEvents = useMemo(() => sessions.reduce((acc, s) => acc + (s.stats?.total_events || 0), 0), [sessions]);  const avgDuration = useMemo(() => {
    if (!sessions.length) return 0;
    return Math.round((sessions.reduce((acc, s) => acc + (s.stats?.duration_ms || 0), 0) / sessions.length) * 10) / 10;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.first_func && s.first_func.toLowerCase().includes(q)) ||
        s.tag.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  // Keep the "Discovered Functions" panel compact: show a fixed batch by
  // default, with scroll + expand for the rest.
  const MAX_VISIBLE_FUNCS = 12;
  const visibleFuncs = useMemo(
    () => (showAllFuncs ? functions : functions.slice(0, MAX_VISIBLE_FUNCS)),
    [functions, showAllFuncs]
  );
  const hiddenFuncCount = Math.max(0, functions.length - MAX_VISIBLE_FUNCS);
  const funcsScrollable = showAllFuncs && functions.length > MAX_VISIBLE_FUNCS;

  // Birdseye-style call records for the expanded session
  const calls = useMemo<CallRecord[]>(() => (expandedSession ? buildCallRecords(expandedSession) : []), [expandedSession]);
  const groupedCalls = useMemo(() => {
    const map = new Map<string, CallRecord[]>();
    calls.forEach((c) => map.set(c.func, [...(map.get(c.func) || []), c]));
    return Array.from(map.entries());
  }, [calls]);
  const funcCalls = useMemo(
    () => (selectedFunc ? groupedCalls.find(([fn]) => fn === selectedFunc)?.[1] || [] : []),
    [groupedCalls, selectedFunc]
  );
  const activeCall = useMemo(
    () => funcCalls.find((c) => c.id === selectedCallId) || funcCalls[0] || null,
    [funcCalls, selectedCallId]
  );

  const badgeFor = (s: SessionSummary) => {
    if (s.title.startsWith('POST')) return 'POST bg-emerald-600 shadow-emerald-500/20';
    if (s.title.startsWith('GET')) return 'GET bg-sky-600 shadow-sky-500/20';
    if (s.tag === 'MCP Tool') return 'MCP bg-purple-600 shadow-purple-500/20';
    if (s.tag === 'Playground Run') return 'TEST bg-amber-600 shadow-amber-500/20';
    return 'FN bg-indigo-600 shadow-indigo-500/20';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Hero + system status */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#060911]/80 backdrop-blur-xl px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-700 dark:from-white dark:via-indigo-200 dark:to-slate-300">
                  Debug Studio Dashboard
                </h1>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-semibold">
                  <span className={`w-2 h-2 rounded-full ${sessions.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {sessions.length > 0 ? 'Live' : 'Awaiting Traffic'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Every run is recorded with complete function calls, variable state, and sub-expression evaluation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs">
                <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span>Listener: <strong className="text-slate-900 dark:text-white">:{listenerPort}</strong></span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs">
                <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                <span>AI: <strong className="text-indigo-600 dark:text-indigo-400">{aiHost}</strong></span>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[
              { icon: Terminal, label: 'Recorded Runs', value: sessions.length, iconCls: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
              { icon: Zap, label: 'Avg Duration', value: avgDuration, suffix: ' ms', iconCls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
              { icon: Activity, label: 'Line Events', value: totalEvents, iconCls: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
              { icon: Layers, label: 'Functions', value: functions.length, iconCls: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="p-3.5 rounded-xl bg-white/80 dark:bg-[#0c1220]/80 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">{kpi.label}</div>
                  <div className="text-xl font-bold font-mono mt-0.5">
                    {kpi.value} {kpi.suffix && <span className="text-[10px] font-normal text-slate-400 font-sans">{kpi.suffix}</span>}
                  </div>
                </div>
                <kpi.icon className={`w-5 h-5 p-1 rounded-lg border ${kpi.iconCls}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-6 space-y-6">
        {/* Traffic simulator */}
        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-[#0c1220]/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Live Traffic Simulator</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Trigger a simulated request and inspect the full trace:</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'api_claim', label: 'POST /api/claims/adjudicate', cls: 'from-emerald-600 to-teal-600' },
              { id: 'api_checkout', label: 'POST /api/v1/checkout', cls: 'from-blue-600 to-indigo-600' },
              { id: 'mcp_tool', label: 'MCP Tool: verify_period', cls: 'from-purple-600 to-fuchsia-600' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => handleSimulate(btn.id)}
                disabled={Boolean(simulating)}
                className={`px-3.5 py-2 rounded-xl bg-gradient-to-r ${btn.cls} disabled:opacity-50 text-white text-xs font-semibold shadow-md flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer`}
              >
                <Send className="w-3.5 h-3.5" />
                {simulating === btn.id ? 'Simulating...' : btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Discovered project functions */}
        {functions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-500" />
              Discovered Functions ({functions.length})
            </h2>
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${
                funcsScrollable ? 'max-h-[26rem] overflow-y-auto pr-1' : ''
              }`}
            >
              {visibleFuncs.map((func) => (
                <div
                  key={`${func.file_path}-${func.name}`}
                  className={`p-4 rounded-xl bg-white/90 dark:bg-[#0c1220] border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 transition-all flex items-center justify-between gap-3`}
                >
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-xs truncate">{func.name}()</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {func.params.map((p) => (
                        <span key={p.name} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{p.name}</span>
                          {p.annotation && <span className="text-slate-400">: {p.annotation}</span>}
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1.5 truncate" title={func.file_path}>
                      {func.file_path.split(/[\\/]/).pop()} : {func.line}
                    </div>
                  </div>
                  <div className="flex flex-col shrink-0 items-end gap-1.5">
                    <button
                      onClick={() => onTryFunction?.(func)}
                      className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      title="Open this function in the Code Sandbox to edit arguments and run it live"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Try It Live
                    </button>
                    <span className="text-[9px] text-slate-400 font-medium">edit args & run in Sandbox</span>
                  </div>
                </div>
              ))}
            </div>

            {functions.length > MAX_VISIBLE_FUNCS && (
              <button
                onClick={() => setShowAllFuncs((v) => !v)}
                aria-expanded={showAllFuncs}
                className="mx-auto md:mx-0 px-4 py-2 rounded-xl bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 flex items-center gap-1.5 transition-colors cursor-pointer
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllFuncs ? 'rotate-180' : ''}`} />
                {showAllFuncs
                  ? `Show fewer (top ${MAX_VISIBLE_FUNCS})`
                  : `Show all ${functions.length} functions (+${hiddenFuncCount} more)`}
              </button>
            )}
          </div>
        )}

        {/* Recorded sessions */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Recorded Executions ({filteredSessions.length})
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter executions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-52 pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={fetchSessions}
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {filteredSessions.map((s) => {
            const isExpanded = expandedId === s.id;
            const badge = badgeFor(s);
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0c1220]/80 overflow-hidden">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className={`w-14 py-1.5 text-center rounded-lg font-mono font-bold text-xs uppercase shrink-0 text-white shadow-sm ${badge.split(' ')[1]} shadow-lg`}>
                      {badge.split(' ')[0]}
                    </span>
                    <span className="font-mono font-bold text-xs truncate">{s.title}</span>
                    {s.first_func && (
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hidden sm:inline truncate">
                        {s.first_func}()
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full font-semibold border ${s.status.includes('Error') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'}`}>
                      {s.status}
                    </span>
                    <div className="text-right hidden md:block">
                      <div className="font-bold">{s.stats?.duration_ms?.toFixed(1) || 0} ms</div>
                      <div className="text-[10px] text-slate-400">{s.stats?.total_events || 0} events</div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/40">
                    {/* Quick actions */}
                    <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60">
                      <button
                        onClick={() => onSelectSession(s.id, 'hunter')}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" /> Replay Timeline
                      </button>
                      <button
                        onClick={() => onSelectSession(s.id, 'birdseye')}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-indigo-500" /> Inspect Calls
                      </button>
                      <button
                        onClick={() => onSelectSession(s.id, 'playground')}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <FlaskConical className="w-3 h-3 text-amber-500" /> Test in Sandbox
                      </button>
                    </div>

                    {/* Birdseye-style complete execution flow */}
                    {calls.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 font-mono">Loading trace data...</div>
                    ) : (
                      <div className="grid grid-cols-12">
                        {/* Call list */}
                        <div className="col-span-12 md:col-span-4 border-r border-slate-200/60 dark:border-slate-800/60 p-3 space-y-2 max-h-80 overflow-y-auto">
                          {groupedCalls.map(([fn, fnCalls]) => (
                            <div key={fn} className="text-xs">
                              <button
                                onClick={() => setSelectedFunc(fn)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-mono font-semibold transition-colors cursor-pointer ${
                                  selectedFunc === fn
                                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <span className="truncate">{fn}()</span>
                                <span className="text-[10px] text-slate-400">{fnCalls.length}×</span>
                              </button>
                              {selectedFunc === fn && fnCalls.map((call, idx) => (
                                <button
                                  key={call.id}
                                  onClick={() => setSelectedCallId(call.id)}
                                  className={`w-full text-left pl-4 pr-2.5 py-1.5 rounded-md mt-0.5 transition-colors cursor-pointer ${
                                    activeCall?.id === call.id
                                      ? 'bg-indigo-600/10 border-l-2 border-indigo-500'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/40 border-l-2 border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                      #{idx + 1}
                                      {call.exc_type && <CircleX className="w-2.5 h-2.5 text-rose-500" />}
                                    </span>
                                    <span className="flex items-center gap-1 text-slate-400">
                                      <Clock className="w-2.5 h-2.5" /> {call.duration_ms.toFixed(2)}ms
                                    </span>
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                    {Object.entries(call.args).map(([k, v]) => `${k}=${v}`).join(', ') || 'no args'}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>

                        {/* Call detail: args, return, expressions */}
                        <div className="col-span-12 md:col-span-8 p-3 max-h-80 overflow-y-auto">
                          {activeCall ? (
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-mono text-sm font-bold">{activeCall.func}()</div>
                                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-all">
                                    {Object.entries(activeCall.args).map(([k, v]) => `${k}=${v}`).join(', ') || 'no arguments'}
                                  </div>
                                </div>
                                {funcCalls.length > 1 && (
                                  <div className="flex items-center gap-1 font-mono text-[11px] shrink-0">
                                    <button
                                      onClick={() => setSelectedCallId(funcCalls[Math.max(0, funcCalls.indexOf(activeCall) - 1)]?.id || null)}
                                      disabled={funcCalls.indexOf(activeCall) === 0}
                                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    {funcCalls.indexOf(activeCall) + 1} / {funcCalls.length}
                                    <button
                                      onClick={() =>
                                        setSelectedCallId(funcCalls[Math.min(funcCalls.length - 1, funcCalls.indexOf(activeCall) + 1)]?.id || null)
                                      }
                                      disabled={funcCalls.indexOf(activeCall) === funcCalls.length - 1}
                                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {activeCall.exc_type ? (
                                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                                      <CircleX className="w-4 h-4 shrink-0" />
                                      <span className="font-mono">Exception Trapped: {activeCall.exc_type}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-rose-500/70 shrink-0">{activeCall.duration_ms.toFixed(2)}ms</span>
                                  </div>
                                  <pre className="font-mono text-[11px] leading-relaxed text-rose-800 dark:text-rose-200 whitespace-pre-wrap break-words select-text bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 m-0">
                                    {activeCall.exc_val || 'No exception message captured.'}
                                  </pre>
                                  <button
                                    onClick={() => onSelectSession(s.id, 'hunter')}
                                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer"
                                  >
                                    Open failed line in Execution Timeline <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 font-mono text-[11px]">
                                  <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                                    ➔ {activeCall.return_val ?? 'None'}
                                  </span>
                                  <span className="text-slate-400">{activeCall.duration_ms.toFixed(2)}ms</span>
                                </div>
                              )}

                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                  Captured Expressions ({activeCall.expressions.length})
                                </div>
                                {activeCall.expressions.length === 0 ? (
                                  <div className="p-4 text-center text-[11px] text-slate-400 font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                                    No sub-expressions captured for this call.
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {activeCall.expressions.map((expr, i) => (
                                      <span
                                        key={`${expr.text}-${i}`}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                      >
                                        <span className="opacity-80">{expr.text}</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">= {expr.val}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => onSelectSession(s.id, 'birdseye')}
                                className="text-[11px] text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                Full Birdseye view <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="p-8 text-center text-xs text-slate-400 font-mono">
                              Select a function call to see its complete state.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="p-12 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              No recorded executions yet. Use the Live Traffic Simulator above or run <span className="text-indigo-400">pydebug run your_script.py</span>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
