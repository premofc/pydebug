import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { BirdseyePage } from './pages/BirdseyePage';
import { HunterPage } from './pages/HunterPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { MOCK_TRACE_SESSION } from './data/mockData';
import type { TraceSession, ThemeMode } from './types';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('pydebug_theme') as ThemeMode) || 'dark';
  });
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'birdseye' | 'hunter' | 'playground'>('dashboard');
  const [session, setSession] = useState<TraceSession>(MOCK_TRACE_SESSION);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeFileInfo, setActiveFileInfo] = useState<{ fileName: string; funcName: string }>({
    fileName: 'my_script.py',
    funcName: 'calculate_order_total',
  });

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('pydebug_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch initial session and subscribe to SSE stream
  useEffect(() => {
    let sse: EventSource | null = null;

    const fetchLatestSession = async () => {
      try {
        const res = await fetch('/api/session');
        if (res.ok) {
          const data = await res.json();
          if (data && data.events && data.events.length > 0) {
            setSession(data);
            setIsConnected(true);
            const firstEv = data.events[0];
            if (firstEv) {
              const fname = data.files[firstEv.file_idx] || 'script.py';
              setActiveFileInfo({
                fileName: fname.split(/[\\/]/).pop() || fname,
                funcName: firstEv.func,
              });
            }
          }
        }
      } catch (err) {
        console.log('Using default mock trace session.');
      }
    };

    fetchLatestSession();

    try {
      sse = new EventSource('/api/stream');
      sse.onopen = () => setIsConnected(true);
      sse.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'new_session' && payload.session) {
            setSession(payload.session);
            setIsConnected(true);
          }
        } catch (err) {
          // ignore keepalive pings
        }
      };
      sse.onerror = () => setIsConnected(false);
    } catch (err) {
      setIsConnected(false);
    }

    return () => {
      if (sse) sse.close();
    };
  }, []);

  const handleSelectSession = async (
    sessionId: string,
    targetView: 'birdseye' | 'hunter' | 'playground'
  ) => {
    try {
      const res = await fetch(`/api/session?id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        const firstEv = data.events[0];
        if (firstEv) {
          const fname = data.files[firstEv.file_idx] || 'script.py';
          setActiveFileInfo({
            fileName: fname.split(/[\\/]/).pop() || fname,
            funcName: firstEv.func,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching selected session:', err);
    }
    setCurrentPage(targetView);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        stats={{
          total_events: session.stats?.total_events || session.events.length,
          duration_ms: session.stats?.duration_ms || 0,
          max_depth: session.stats?.max_depth || 1,
        }}
        isConnected={isConnected}
        sessionId={session.id}
        activeFileName={activeFileInfo.fileName}
        activeFunctionName={activeFileInfo.funcName}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {currentPage === 'dashboard' && (
          <DashboardPage
            onSelectSession={handleSelectSession}
          />
        )}
        {currentPage === 'birdseye' && (
          <BirdseyePage
            session={session}
            onCallChange={(fileName, funcName) => setActiveFileInfo({ fileName, funcName })}
          />
        )}
        {currentPage === 'hunter' && (
          <HunterPage
            session={session}
            onEventChange={(fileName, funcName) => setActiveFileInfo({ fileName, funcName })}
          />
        )}
        {currentPage === 'playground' && (
          <PlaygroundPage
            session={session}
            onSessionUpdated={(newSess) => {
              setSession(newSess);
              const firstEv = newSess.events[0];
              if (firstEv) {
                const fname = newSess.files[firstEv.file_idx] || 'script.py';
                setActiveFileInfo({
                  fileName: fname.split(/[\\/]/).pop() || fname,
                  funcName: firstEv.func,
                });
              }
            }}
            onNavigateToHunter={() => setCurrentPage('hunter')}
          />
        )}
      </main>
    </div>
  );
};

export default App;
