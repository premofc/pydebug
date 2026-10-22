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
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Activity,
  Layers,
  Clock,
  Send,
  Boxes,
} from 'lucide-react';
import type { SessionSummary, FunctionSignature } from '../types';

interface DashboardPageProps {
  onSelectSession: (sessionId: string, targetView: 'birdseye' | 'hunter' | 'playground') => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onSelectSession,
}) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [functions, setFunctions] = useState<FunctionSignature[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Accordion expansion state for Swagger-style operations
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Quick Execute in Accordion
  const [executingFunc, setExecutingFunc] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data: SessionSummary[] = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.log('Error loading sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchFunctions = async () => {
    try {
      const res = await fetch('/api/functions');
      if (res.ok) {
        const data: FunctionSignature[] = await res.json();
        setFunctions(data);
      }
    } catch (err) {
      console.log('Error loading discovered functions');
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchFunctions();
    const interval = setInterval(() => {
      fetchSessions();
      fetchFunctions();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSimulate = async (scenario: 'api_claim' | 'api_checkout' | 'mcp_tool') => {
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
        if (data.session?.id) {
          onSelectSession(data.session.id, 'hunter');
        }
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(null);
    }
  };

  const handleQuickExecute = async (func: FunctionSignature) => {
    setExecutingFunc(func.name);
    try {
      const template: Record<string, any> = {};
      func.params.forEach((p) => {
        if (p.annotation?.includes('list')) {
          template[p.name] = [{ name: 'Test Item', price: 45.0, qty: 2 }];
        } else if (p.annotation?.includes('int')) {
          template[p.name] = 35;
        } else if (p.annotation?.includes('float')) {
          template[p.name] = 24.5;
        } else if (p.annotation?.includes('bool')) {
          template[p.name] = false;
        } else {
          template[p.name] = p.default !== 'None' && p.default ? p.default.replace(/['"]/g, '') : 'VIP20';
        }
      });

      const res = await fetch('/api/execute-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: func.file_path,
          function_name: func.name,
          args: template,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        await fetchSessions();
        if (data.session?.id) {
          onSelectSession(data.session.id, 'hunter');
        }
      }
    } catch (e) {
      console.error('Quick execute error:', e);
    } finally {
      setExecutingFunc(null);
    }
  };

  const copyCode = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(key);
    setTimeout(() => setCopiedSnippet(null), 1500);
  };

  // KPI Calculations
  const totalRuns = sessions.length;
  const avgLatency = useMemo(() => {
    if (!sessions.length) return 0;
    const total = sessions.reduce((acc, s) => acc + (s.stats?.duration_ms || 0), 0);
    return Math.round((total / sessions.length) * 10) / 10;
  }, [sessions]);

  const totalEvents = useMemo(() => {
    return sessions.reduce((acc, s) => acc + (s.stats?.total_events || 0), 0);
  }, [sessions]);


  // Filtered Sessions List
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedTag !== 'all' && s.tag !== selectedTag) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.first_func && s.first_func.toLowerCase().includes(q)) ||
        s.tag.toLowerCase().includes(q)
      );
    });
  }, [sessions, selectedTag, searchQuery]);

  // Method tag stylings inspired by Swagger UI
  const getSwaggerStyle = (title: string, tag: string) => {
    if (title.startsWith('POST')) {
      return {
        badge: 'POST',
        badgeBg: 'bg-emerald-600 text-white',
        border: 'border-emerald-500/40 dark:border-emerald-500/30',
        bg: 'bg-emerald-500/5 dark:bg-emerald-950/15',
        hover: 'hover:bg-emerald-500/10 dark:hover:bg-emerald-950/25',
      };
    }
    if (title.startsWith('GET')) {
      return {
        badge: 'GET',
        badgeBg: 'bg-blue-600 text-white',
        border: 'border-blue-500/40 dark:border-blue-500/30',
        bg: 'bg-blue-500/5 dark:bg-blue-950/15',
        hover: 'hover:bg-blue-500/10 dark:hover:bg-blue-950/25',
      };
    }
    if (title.startsWith('MCP') || tag === 'MCP Tool') {
      return {
        badge: 'MCP',
        badgeBg: 'bg-purple-600 text-white',
        border: 'border-purple-500/40 dark:border-purple-500/30',
        bg: 'bg-purple-500/5 dark:bg-purple-950/15',
        hover: 'hover:bg-purple-500/10 dark:hover:bg-purple-950/25',
      };
    }
    if (tag === 'Playground Run') {
      return {
        badge: 'TEST',
        badgeBg: 'bg-amber-600 text-white',
        border: 'border-amber-500/40 dark:border-amber-500/30',
        bg: 'bg-amber-500/5 dark:bg-amber-950/15',
        hover: 'hover:bg-amber-500/10 dark:hover:bg-amber-950/25',
      };
    }
    return {
      badge: 'FN',
      badgeBg: 'bg-slate-700 text-white dark:bg-slate-600',
      border: 'border-slate-300 dark:border-slate-700',
      bg: 'bg-slate-50 dark:bg-slate-900/50',
      hover: 'hover:bg-slate-100 dark:hover:bg-slate-800/60',
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 select-none transition-colors">
      {/* 1. TOP SWAGGER-STYLE HERO BANNER */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] px-6 py-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                PyDebug Interactive API & Function Catalog
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold uppercase">
                OAS 3.0 + AST Spy
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Interceptor Active
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Real-time execution dashboard inspired by Swagger UI. Every API endpoint request, MCP tool invocation, and Python function is captured live. Expand any block below to inspect parameters, run tests live with your own arguments, or launch into the line-by-line Hunter timeline.
            </p>
          </div>

          {/* Quick System Status Chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <Radio className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
              <span>Listener: Port 8899</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              <span>Ollama: 172.30.0.3</span>
            </div>
          </div>
        </div>

        {/* 2. STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Recorded Operations
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {totalRuns}
              </div>
            </div>
            <Activity className="w-5 h-5 text-indigo-500 opacity-80" />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Average Latency
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {avgLatency} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
            </div>
            <Clock className="w-5 h-5 text-blue-500 opacity-80" />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Total Line Events
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {totalEvents}
              </div>
            </div>
            <Layers className="w-5 h-5 text-emerald-500 opacity-80" />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Discovered Functions
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {functions.length}
              </div>
            </div>
            <Boxes className="w-5 h-5 text-purple-500 opacity-80" />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 3. SIMULATOR & QUICK TRIGGERS BAR */}
        <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              <Zap className="w-4 h-4 fill-current" />
              <span>Simulate Live Incoming Requests (Swagger Test Triggers)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Click any button to send a live intercepted request and watch it appear in the catalog below:
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSimulate('api_claim')}
              disabled={Boolean(simulating)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{simulating === 'api_claim' ? 'Intercepting...' : 'POST /api/claims/adjudicate'}</span>
            </button>

            <button
              onClick={() => handleSimulate('api_checkout')}
              disabled={Boolean(simulating)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>POST /api/v1/checkout/calculate</span>
            </button>

            <button
              onClick={() => handleSimulate('mcp_tool')}
              disabled={Boolean(simulating)}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>MCP Tool: verify_waiting_period</span>
            </button>
          </div>
        </div>

        {/* 4. DISCOVERED FUNCTIONS & API SCHEMA SECTION (SWAGGER SPEC CARDS) */}
        {functions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-500" />
                <span>Discovered Code Functions & Signatures ({functions.length})</span>
              </h2>
              <span className="text-xs text-slate-400 font-mono">Auto-extracted via Python AST</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {functions.map((func) => (
                <div
                  key={func.name}
                  className="p-3.5 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          FUNC
                        </span>
                        <span className="font-mono font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {func.name}()
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Line {func.line}
                      </span>
                    </div>

                    {/* Parameters list */}
                    <div className="mt-2 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Parameters ({func.params.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {func.params.map((p) => (
                          <span
                            key={p.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{p.name}</span>
                            {p.annotation && (
                              <span className="text-slate-400">: {p.annotation}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Run Button */}
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 truncate max-w-[200px]" title={func.file_path}>
                      {func.file_path.split(/[\\/]/).pop()}
                    </span>

                    <button
                      onClick={() => handleQuickExecute(func)}
                      disabled={executingFunc === func.name}
                      className="px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-medium border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{executingFunc === func.name ? 'Tracing...' : 'Try It Live'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. SWAGGER-STYLE INTERCEPTED API & EXECUTIONS LIST */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span>Recorded API Endpoints & Executions ({filteredSessions.length})</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any row to expand request parameters, response payload, and jump to line-by-line inspection.
              </p>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'FastAPI Endpoint', label: 'APIs' },
                  { id: 'MCP Tool', label: 'MCP Tools' },
                  { id: 'Python Script', label: 'Scripts' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTag(t.id)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      selectedTag === t.id
                        ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter endpoints..."
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-44"
                />
              </div>

              <button
                onClick={fetchSessions}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                title="Refresh feed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Swagger Accordion Operations */}
          <div className="space-y-2.5">
            {filteredSessions.length > 0 ? (
              filteredSessions.map((s) => {
                const isExpanded = Boolean(expandedItems[s.id]);
                                const style = getSwaggerStyle(s.title, s.tag);

                return (
                  <div
                    key={s.id}
                    className={`rounded-xl border transition-all overflow-hidden ${style.border} ${style.bg}`}
                  >
                    {/* Collapsible Header Row (Swagger Operation Bar) */}
                    <div
                      onClick={() => toggleExpand(s.id)}
                      className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer ${style.hover}`}
                    >
                      {/* Left: Method Badge & Path */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span
                          className={`w-14 py-1 text-center rounded font-mono font-bold text-xs uppercase tracking-wider shrink-0 shadow-xs ${style.badgeBg}`}
                        >
                          {style.badge}
                        </span>

                        <div className="truncate">
                          <span className="font-mono font-semibold text-xs text-slate-900 dark:text-slate-100">
                            {s.title.replace(/^(GET|POST|PUT|DELETE)\s+/, '')}
                          </span>
                          {s.first_func && (
                            <span className="ml-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              (handler: {s.first_func}())
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Metrics & Arrow */}
                      <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                            s.status.includes('Error')
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {s.status}
                        </span>

                        <div className="text-right">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {s.stats?.duration_ms?.toFixed(1) || 0} ms
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {s.stats?.total_events || 0} evs
                          </span>
                        </div>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Body Details (Swagger Operation Expanded Pane) */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-200/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-950/40 text-xs font-mono space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                          {/* Metadata Card */}
                          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                              Execution Context
                            </span>
                            <div className="space-y-1 text-[11px]">
                              <div>Session: <span className="text-indigo-500">#{s.id.slice(0, 8)}</span></div>
                              <div>Captured: <span>{new Date(s.created_at).toLocaleTimeString()}</span></div>
                              <div>Calls Count: <span>{s.stats?.calls_count || 1}</span></div>
                            </div>
                          </div>

                          {/* Quick Actions Card */}
                          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 md:col-span-2 flex flex-col justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                              Jump To Line-By-Line Time-Travel Inspection
                            </span>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <button
                                onClick={() => onSelectSession(s.id, 'hunter')}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Replay with Hunter VCR Player</span>
                              </button>

                              <button
                                onClick={() => onSelectSession(s.id, 'birdseye')}
                                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect Birdseye AST Trees</span>
                              </button>

                              <button
                                onClick={() => onSelectSession(s.id, 'playground')}
                                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
                              >
                                <FlaskConical className="w-3.5 h-3.5" />
                                <span>Modify Arguments in Playground</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No recorded executions yet. Use the Live Traffic Simulator above or trigger any API call.
              </div>
            )}
          </div>
        </div>

        {/* 6. INTEGRATION QUICK-START SNIPPETS */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-500" />
            <span>How to Connect Your FastAPI, MCP Tools & Python Scripts</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1.5 font-sans">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  FastAPI / Starlette Middleware
                </span>
                <button
                  onClick={() =>
                    copyCode(
                      'fastapi',
                      'from pydebug.integrations.fastapi import PyDebugMiddleware\napp.add_middleware(PyDebugMiddleware)'
                    )
                  }
                  className="hover:text-slate-200 flex items-center gap-1"
                >
                  {copiedSnippet === 'fastapi' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet === 'fastapi' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="text-indigo-600 dark:text-indigo-400 overflow-x-auto text-[11px] leading-5">
                {`from pydebug.integrations.fastapi import PyDebugMiddleware\napp.add_middleware(PyDebugMiddleware)`}
              </pre>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1.5 font-sans">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  MCP Tools / Decorator Spy
                </span>
                <button
                  onClick={() =>
                    copyCode('mcp', 'from pydebug.core.tracer import spy\n@spy\ndef my_tool(...): ...')
                  }
                  className="hover:text-slate-200 flex items-center gap-1"
                >
                  {copiedSnippet === 'mcp' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet === 'mcp' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="text-indigo-600 dark:text-indigo-400 overflow-x-auto text-[11px] leading-5">
                {`from pydebug.core.tracer import spy\n@spy\ndef my_tool(param1: str):\n    ...`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
