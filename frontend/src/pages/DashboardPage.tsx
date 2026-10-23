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
  Sparkles
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
        if (data.length > 0 && Object.keys(expandedItems).length === 0) {
          setExpandedItems({ [data[0].id]: true });
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
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
      console.error('Failed to fetch discovered functions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchFunctions();
    const interval = setInterval(() => {
      fetchSessions();
    }, 2500);
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
          template[p.name] = [{ name: 'Standard Item', price: 50.0, qty: 1 }];
        } else if (p.annotation?.includes('int')) {
          template[p.name] = 25;
        } else if (p.annotation?.includes('float')) {
          template[p.name] = 99.5;
        } else if (p.annotation?.includes('bool')) {
          template[p.name] = true;
        } else {
          template[p.name] = p.default !== 'None' && p.default ? p.default.replace(/['"]/g, '') : 'POL-100293';
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

  // Method tag stylings inspired by Swagger UI with rich neon glows
  const getSwaggerStyle = (title: string, tag: string) => {
    if (title.startsWith('POST')) {
      return {
        badge: 'POST',
        badgeBg: 'bg-emerald-600 text-white shadow-emerald-500/20',
        border: 'border-emerald-500/30 hover:border-emerald-500/60 dark:border-emerald-500/20 dark:hover:border-emerald-500/50',
        bg: 'bg-emerald-500/[0.03] dark:bg-emerald-950/[0.12]',
        hover: 'hover:bg-emerald-500/[0.07] dark:hover:bg-emerald-950/[0.22]',
        pillText: 'text-emerald-400',
      };
    }
    if (title.startsWith('GET')) {
      return {
        badge: 'GET',
        badgeBg: 'bg-sky-600 text-white shadow-sky-500/20',
        border: 'border-sky-500/30 hover:border-sky-500/60 dark:border-sky-500/20 dark:hover:border-sky-500/50',
        bg: 'bg-sky-500/[0.03] dark:bg-sky-950/[0.12]',
        hover: 'hover:bg-sky-500/[0.07] dark:hover:bg-sky-950/[0.22]',
        pillText: 'text-sky-400',
      };
    }
    if (title.startsWith('MCP') || tag === 'MCP Tool' || title.includes('[MCP]')) {
      return {
        badge: 'MCP',
        badgeBg: 'bg-purple-600 text-white shadow-purple-500/20',
        border: 'border-purple-500/30 hover:border-purple-500/60 dark:border-purple-500/20 dark:hover:border-purple-500/50',
        bg: 'bg-purple-500/[0.03] dark:bg-purple-950/[0.12]',
        hover: 'hover:bg-purple-500/[0.07] dark:hover:bg-purple-950/[0.22]',
        pillText: 'text-purple-400',
      };
    }
    if (tag === 'Playground Run' || title.includes('Live')) {
      return {
        badge: 'TEST',
        badgeBg: 'bg-amber-600 text-white shadow-amber-500/20',
        border: 'border-amber-500/30 hover:border-amber-500/60 dark:border-amber-500/20 dark:hover:border-amber-500/50',
        bg: 'bg-amber-500/[0.03] dark:bg-amber-950/[0.12]',
        hover: 'hover:bg-amber-500/[0.07] dark:hover:bg-amber-950/[0.22]',
        pillText: 'text-amber-400',
      };
    }
    return {
      badge: 'FN',
      badgeBg: 'bg-indigo-600 text-white shadow-indigo-500/20',
      border: 'border-slate-300 dark:border-slate-800 hover:border-indigo-500/50',
      bg: 'bg-slate-100/50 dark:bg-slate-900/[0.3]',
      hover: 'hover:bg-slate-200/50 dark:hover:bg-slate-800/[0.4]',
      pillText: 'text-indigo-400',
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 select-none transition-colors">
      {/* 1. TOP MODERN HERO BANNER WITH AMBIENT GLOW */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0a0f1d]/80 backdrop-blur-xl px-6 py-6 relative overflow-hidden">
        {/* Subtle radial ambient background glow */}
        <div className="absolute -top-24 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-700 dark:from-white dark:via-indigo-200 dark:to-slate-300">
                  Interactive API & Function Studio
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 uppercase tracking-wide">
                  OAS 3.0 + AST Spy
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Interceptor Active
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
                Central developer control center. Every API request from Swagger, Postman, or MCP Inspector is intercepted live with sub-millisecond line profiling, intermediate variable state, and one-click VCR time-travel replay.
              </p>
            </div>

            {/* Quick System Status Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
                <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span>Listener: <strong className="text-slate-900 dark:text-white">:8899</strong></span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
                <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                <span>Ollama AI: <strong className="text-indigo-600 dark:text-indigo-400">172.30.0.3</strong></span>
              </div>
            </div>
          </div>

          {/* 2. ELEVATED GLASS KPI STAT CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="p-4 rounded-xl bg-white/80 dark:bg-[#0d1322]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 flex items-center justify-between group">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-500" />
                  Recorded Runs
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                  {totalRuns}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-500/20">
                <Terminal className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/80 dark:bg-[#0d1322]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 flex items-center justify-between group">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  Avg Duration
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                  {avgLatency} <span className="text-xs font-normal text-slate-400 font-sans">ms</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                <Zap className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/80 dark:bg-[#0d1322]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 flex items-center justify-between group">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-500" />
                  Line Events
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors">
                  {totalEvents}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <Code2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/80 dark:bg-[#0d1322]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300 flex items-center justify-between group">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-cyan-500" />
                  Functions
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors">
                  {functions.length}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500 border border-cyan-500/20">
                <FlaskConical className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full p-6 space-y-6">
        {/* 3. INTERACTIVE TRAFFIC SIMULATOR BAR */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-emerald-500/5 dark:from-indigo-950/20 dark:via-purple-950/20 dark:to-emerald-950/20 border border-slate-200/80 dark:border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              <span>Live Traffic Simulator (Instant Intercept Bench)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Trigger simulated real-world payloads to verify instant intercept & time-travel recording:
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleSimulate('api_claim')}
              disabled={Boolean(simulating)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{simulating === 'api_claim' ? 'Simulating...' : 'POST /api/claims/adjudicate'}</span>
            </button>

            <button
              onClick={() => handleSimulate('api_checkout')}
              disabled={Boolean(simulating)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>POST /api/v1/checkout/calculate</span>
            </button>

            <button
              onClick={() => handleSimulate('mcp_tool')}
              disabled={Boolean(simulating)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-purple-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>MCP Tool: verify_waiting_period</span>
            </button>
          </div>
        </div>

        {/* 4. DISCOVERED FUNCTIONS CARDS */}
        {functions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-500" />
                <span>Discovered Project Functions ({functions.length})</span>
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">AST Extracted</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {functions.map((func) => (
                <div
                  key={func.name}
                  className="p-4 rounded-xl bg-white/90 dark:bg-[#0c1220]/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          FUNC
                        </span>
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          {func.name}()
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Line {func.line}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {func.params.map((p) => (
                          <span
                            key={p.name}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-mono bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
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

                  <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]" title={func.file_path}>
                      {func.file_path.split(/[\\/]/).pop()}
                    </span>

                    <button
                      onClick={() => handleQuickExecute(func)}
                      disabled={executingFunc === func.name}
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer"
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

        {/* 5. SWAGGER-STYLE RECORDED OPERATIONS LIST */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span>Recorded API Endpoints & Executions ({filteredSessions.length})</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Click any row to expand request parameters, metadata, and jump directly into the execution timeline.
              </p>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'FastAPI Endpoint', label: 'APIs' },
                  { id: 'MCP Tool', label: 'MCP Tools' },
                  { id: 'Python Script', label: 'Scripts' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTag(t.id)}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      selectedTag === t.id
                        ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 md:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                onClick={fetchSessions}
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Refresh sessions feed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Swagger Accordion Items */}
          <div className="space-y-3">
            {filteredSessions.length > 0 ? (
              filteredSessions.map((s) => {
                const isExpanded = Boolean(expandedItems[s.id]);
                const style = getSwaggerStyle(s.title, s.tag);

                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${style.border} ${style.bg}`}
                  >
                    {/* Collapsible Header Row (Swagger Operation Bar) */}
                    <div
                      onClick={() => toggleExpand(s.id)}
                      className={`p-4 flex items-center justify-between gap-3 cursor-pointer ${style.hover}`}
                    >
                      {/* Left: Method Badge & Path */}
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <span
                          className={`w-14 py-1.5 text-center rounded-lg font-mono font-bold text-xs uppercase tracking-wider shrink-0 shadow-sm ${style.badgeBg}`}
                        >
                          {style.badge}
                        </span>

                        <div className="truncate">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                            {s.title.replace(/^(GET|POST|PUT|DELETE)\s+/, '')}
                          </span>
                          {s.first_func && (
                            <span className="ml-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              (handler: <span className={style.pillText}>{s.first_func}()</span>)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Metrics & Arrow */}
                      <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            s.status.includes('Error')
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {s.status}
                        </span>

                        <div className="text-right">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {s.stats?.duration_ms?.toFixed(1) || 0} ms
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {s.stats?.total_events || 0} events
                          </span>
                        </div>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Body Details (Swagger Operation Expanded Pane) */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-3 border-t border-slate-200/50 dark:border-slate-800/60 bg-white/70 dark:bg-slate-950/60 text-xs font-mono space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
                          {/* Metadata Card */}
                          <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                              Execution Context
                            </span>
                            <div className="space-y-1.5 text-[11px]">
                              <div>Session: <span className="text-indigo-500 font-bold">#{s.id.slice(0, 8)}</span></div>
                              <div>Captured: <span className="text-slate-600 dark:text-slate-300">{new Date(s.created_at).toLocaleTimeString()}</span></div>
                              <div>Total Calls: <span className="text-slate-600 dark:text-slate-300">{s.stats?.calls_count || 1}</span></div>
                            </div>
                          </div>

                          {/* Quick Actions Card */}
                          <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 md:col-span-2 flex flex-col justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                              Deep Inspection & Time-Travel Debugging
                            </span>
                            <div className="flex flex-wrap items-center gap-2.5 mt-1">
                              <button
                                onClick={() => onSelectSession(s.id, 'hunter')}
                                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all hover:scale-[1.02] cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Replay Timeline</span>
                              </button>

                              <button
                                onClick={() => onSelectSession(s.id, 'birdseye')}
                                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-indigo-500" />
                                <span>Inspect Function Calls</span>
                              </button>

                              <button
                                onClick={() => onSelectSession(s.id, 'playground')}
                                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer"
                              >
                                <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
                                <span>Test in Sandbox</span>
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
              <div className="p-12 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
                No recorded executions yet. Use the Live Traffic Simulator above or trigger any API call.
              </div>
            )}
          </div>
        </div>

        {/* 6. INTEGRATION QUICK-START SNIPPETS */}
        <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0c1220]/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Terminal className="w-4 h-4 text-indigo-500" />
              <span>Zero-Touch Project Integration</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Copy & Paste</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">1-Command Global Auto-Hook:</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">pydebug install</span>
              </div>
              <button
                onClick={() => copyCode('install', 'pydebug install')}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
                title="Copy command"
              >
                {copiedSnippet === 'install' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">Start Visual Studio Listener:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">pydebug serve --port 8899</span>
              </div>
              <button
                onClick={() => copyCode('serve', 'pydebug serve --port 8899')}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
                title="Copy command"
              >
                {copiedSnippet === 'serve' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
