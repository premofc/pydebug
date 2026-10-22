import React from 'react';
import { 
  Terminal, 
  Sun, 
  Moon, 
  Clock, 
  Activity,
  FileCode,
  Eye,
  Play,
  FlaskConical,
  LayoutDashboard
} from 'lucide-react';
import type { ThemeMode } from '../types';

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  currentPage: 'dashboard' | 'birdseye' | 'hunter' | 'playground';
  onPageChange: (page: 'dashboard' | 'birdseye' | 'hunter' | 'playground') => void;
  stats: {
    total_events: number;
    duration_ms: number;
    max_depth: number;
  };
  isConnected: boolean;
  sessionId: string;
  activeFileName?: string;
  activeFunctionName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  onToggleTheme,
  currentPage,
  onPageChange,
  stats,
  isConnected,
  sessionId,
  activeFileName,
  activeFunctionName
}) => {
  return (
    <header className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] px-4 flex items-center justify-between select-none z-30 transition-colors">
      {/* Brand & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <div 
          onClick={() => onPageChange('dashboard')}
          className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
        >
          <div className="w-6 h-6 rounded bg-slate-900 dark:bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <span className="tracking-tight font-medium">PyDebug</span>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800" />

        {/* Live SSE / Status Badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="font-sans text-[11px] font-medium">{isConnected ? 'Live' : 'Snapshot'}</span>
          <span className="text-[10px] text-slate-400 font-mono">#{sessionId.slice(0, 8)}</span>
        </div>

        {/* Active File & Function Breadcrumb */}
        {activeFileName && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>/</span>
            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <FileCode className="w-3.5 h-3.5 text-slate-400" />
              {activeFileName}
            </span>
            {activeFunctionName && (
              <>
                <span>›</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                  {activeFunctionName}()
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Center: Mode Switcher (Dashboard vs Birdseye Inspector vs Hunter Timeline vs Live Playground) */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => onPageChange('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
            currentPage === 'dashboard'
              ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="Central Observability Dashboard: Traced APIs, Tools & Execution Stream"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => onPageChange('birdseye')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
            currentPage === 'birdseye'
              ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="Birdseye AST Sub-expression & Call Hierarchy Inspector"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Birdseye Inspector</span>
        </button>

        <button
          onClick={() => onPageChange('hunter')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
            currentPage === 'hunter'
              ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="Hunter Line-by-Line Play / Pause Execution Timeline"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Hunter Timeline</span>
        </button>

        <button
          onClick={() => onPageChange('playground')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
            currentPage === 'playground'
              ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="Live Function Argument Playground & Test Case Bench"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Playground</span>
        </button>
      </div>

      {/* Right Controls: Stats & Dark/Light Toggle */}
      <div className="flex items-center gap-3">
        {/* Execution Stats */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <Activity className="w-3 h-3 text-slate-400" />
            {stats.total_events} evs
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <Clock className="w-3 h-3 text-slate-400" />
            {stats.duration_ms.toFixed(1)}ms
          </span>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

        {/* Dark / Light Mode Toggle Button */}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>
      </div>
    </header>
  );
};
