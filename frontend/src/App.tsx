import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { AiSettingsModal } from './components/AiSettingsModal';
import { DashboardPage } from './pages/DashboardPage';
import { BirdseyePage } from './pages/BirdseyePage';
import { HunterPage } from './pages/HunterPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import type { TraceSession, ThemeMode, AIProviderConfig, FunctionSignature, PageId } from './types';

const EMPTY_TRACE_SESSION: TraceSession = {
  id: '',
  title: '',
  created_at: '',
  files: [],
  file_sources: {},
  events: [],
  stats: { total_events: 0, files_count: 0, duration_ms: 0, max_depth: 0 },
};

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem('pydebug_theme');
      return stored === 'light' || stored === 'dark' ? stored : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const hash = window.location.hash.replace('#', '') as PageId;
    if (['dashboard', 'hunter', 'birdseye', 'playground'].includes(hash)) {
      return hash;
    }
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') as PageId;
    if (['dashboard', 'hunter', 'birdseye', 'playground'].includes(view)) {
      return view;
    }
    return 'dashboard';
  });

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace('#', '') as PageId;
      if (['dashboard', 'hunter', 'birdseye', 'playground'].includes(h)) {
        setCurrentPage(h);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const changePage = (page: PageId) => {
    setCurrentPage(page);
    window.location.hash = page;
  };
  const [session, setSession] = useState<TraceSession>(EMPTY_TRACE_SESSION);
  // The mock is only a placeholder for the Birdseye/Hunter views until real
  // trace data arrives; the navbar must not present it as a real session.
  const [hasRealSession, setHasRealSession] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiConfig, setAiConfig] = useState<AIProviderConfig | null>(null);
  const [activeFileInfo, setActiveFileInfo] = useState<{ fileName: string; funcName: string }>({
    fileName: '',
    funcName: '',
  });
  // Function picked via "Try It Live" on the Dashboard; handed to the Code
  // Sandbox so the user can edit arguments there before executing.
  const [pendingPlaygroundFunc, setPendingPlaygroundFunc] = useState<FunctionSignature | null>(null);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = theme;
    try { localStorage.setItem('pydebug_theme', theme); } catch { /* Storage may be disabled by browser policy. */ }
  }, [theme]);

  // Stable handlers: new-identity props would re-trigger the pages'
  // notification effects on every render (setState -> render -> new prop ->
  // effect -> setState ...), an infinite loop. Guard state too.
  const handleActiveFileChange = useCallback((fileName: string, funcName: string) => {
    setActiveFileInfo((prev) =>
      prev.fileName === fileName && prev.funcName === funcName ? prev : { fileName, funcName }
    );
  }, []);
  const openAiSettings = useCallback(() => setIsAiModalOpen(true), []);
  const closeAiSettings = useCallback(() => setIsAiModalOpen(false), []);
  const consumePendingPlaygroundFunc = useCallback(() => setPendingPlaygroundFunc(null), []);
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch initial AI provider config
  useEffect(() => {
    const fetchAiConfig = async () => {
      try {
        const res = await fetch('/api/ai/config');
        if (res.ok) {
          const cfg: AIProviderConfig = await res.json();
          setAiConfig(cfg);
        }
      } catch {
        // Fallback default
        setAiConfig({
          provider: 'ollama',
          base_url: 'http://127.0.0.1:11434',
          model: 'qwen2.5:7b-instruct',
        });
      }
    };
    fetchAiConfig();
  }, []);

  // Fetch initial session and subscribe to SSE stream
  useEffect(() => {
    let sse: EventSource | null = null;
    let isUnmounted = false;

    const fetchLatestSession = async () => {
      try {
        const res = await fetch('/api/session');
        if (res.ok) {
          const data = await res.json();
          if (!isUnmounted && data && Array.isArray(data.events) && data.events.length > 0) {
            setSession(data);
            setHasRealSession(true);
            setIsConnected(true);
            const firstEv = data.events[0];
            if (firstEv) {
              const fname = (Array.isArray(data.files) && data.files[firstEv.file_idx]) || 'script.py';
              setActiveFileInfo({
                fileName: fname.split(/[\\/]/).pop() || fname,
                funcName: firstEv.func,
              });
            }
          }
        }
      } catch {
        console.log('Using default mock trace session.');
      }
    };

    fetchLatestSession();

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = () => {
      if (isUnmounted) return;
      try {
        sse = new EventSource('/api/stream');
        sse.onopen = () => setIsConnected(true);
        sse.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.type === 'new_session' && payload.session) {
              setSession(payload.session);
              setHasRealSession(true);
              setIsConnected(true);
              const firstEv = payload.session.events?.[0];
              if (firstEv) {
                const fname = payload.session.files?.[firstEv.file_idx] || 'script.py';
                setActiveFileInfo({ fileName: fname.split(/[\\/]/).pop() || fname, funcName: firstEv.func || '' });
              }
            }
          } catch {
            // ignore keepalive pings
          }
        };
        sse.onerror = () => {
          setIsConnected(false);
          if (sse) {
            sse.close();
            sse = null;
          }
          if (!isUnmounted) {
            // Backoff 5s before reconnecting so tab doesn't spin in tight CPU loop when server is stopped
            reconnectTimeout = setTimeout(connectSSE, 5000);
          }
        };
      } catch {
        setIsConnected(false);
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connectSSE, 5000);
        }
      }
    };

    connectSSE();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (sse) sse.close();
    };
  }, []);

  const handleSelectSession = async (
    sessionId: string,
    targetView: PageId
  ) => {
    try {
      const res = await fetch(`/api/session?id=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data: TraceSession = await res.json();
        setSession(data);
        setHasRealSession(true);
        const firstEv = data.events?.[0];
        if (firstEv) {
          const fname = data.files?.[firstEv.file_idx] || 'script.py';
          setActiveFileInfo({
            fileName: fname.split(/[\\/]/).pop() || fname,
            funcName: firstEv.func,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching selected session:', err);
    }
    changePage(targetView);
  };

  return (
    <div className="app-shell h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-[#060911] text-slate-900 dark:text-slate-100 transition-colors relative">
      <div className="app-content flex flex-1 min-h-0 flex-col overflow-hidden" inert={isAiModalOpen}>
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        currentPage={currentPage}
        onPageChange={changePage}
        stats={
          hasRealSession
            ? {
                total_events: session.stats?.total_events || session.events.length,
                duration_ms: session.stats?.duration_ms || 0,
                max_depth: session.stats?.max_depth || 1,
              }
            : { total_events: 0, duration_ms: 0, max_depth: 0 }
        }
        isConnected={isConnected}
        sessionId={session.id}
        activeFileName={hasRealSession ? activeFileInfo.fileName : undefined}
        activeFunctionName={hasRealSession ? activeFileInfo.funcName : undefined}
        aiConfig={aiConfig}
        onOpenAiSettings={openAiSettings}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {currentPage === 'dashboard' && (
          <DashboardPage
            onSelectSession={handleSelectSession}
            aiConfig={aiConfig}
            onTryFunction={(fn) => {
              setPendingPlaygroundFunc(fn);
              changePage('playground');
            }}
          />
        )}
        {currentPage === 'birdseye' && (
          <BirdseyePage
            session={session}
            onCallChange={handleActiveFileChange}
            onOpenSandbox={() => changePage('playground')}
          />
        )}
        {currentPage === 'hunter' && (
          <HunterPage
            session={session}
            onEventChange={handleActiveFileChange}
            aiConfig={aiConfig}
            onOpenAiSettings={openAiSettings}
            onOpenSandbox={() => changePage('playground')}
          />
        )}
        {currentPage === 'playground' && (
          <PlaygroundPage
            session={session}
            onSessionUpdated={(newSess) => {
              setSession(newSess);
              setHasRealSession(true);
              const firstEv = newSess.events[0];
              if (firstEv) {
                const fname = newSess.files[firstEv.file_idx] || 'script.py';
                setActiveFileInfo({
                  fileName: fname.split(/[\\/]/).pop() || fname,
                  funcName: firstEv.func,
                });
              }
            }}
            onNavigateToHunter={() => changePage('hunter')}
            initialFunction={pendingPlaygroundFunc}
            onConsumeInitialFunction={consumePendingPlaygroundFunc}
          />
        )}
      </main>
      </div>

      {/* Modern AI Co-Pilot Provider Configuration Modal */}
      <AiSettingsModal
        isOpen={isAiModalOpen}
        onClose={closeAiSettings}
        onConfigSaved={(updated) => setAiConfig(updated)}
      />
    </div>
  );
};

export default App;
