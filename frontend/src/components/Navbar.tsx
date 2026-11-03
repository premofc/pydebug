import React from 'react';
import type { ThemeMode, AIProviderConfig, PageId } from '../types';

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  currentPage: PageId;
  onPageChange: (page: PageId) => void;
  stats?: {
    total_events: number;
    duration_ms: number;
    max_depth: number;
  };
  isConnected?: boolean;
  sessionId?: string;
  activeFileName?: string;
  activeFunctionName?: string;
  aiConfig?: AIProviderConfig | null;
  onOpenAiSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  onToggleTheme,
  onPageChange,
  activeFileName,
  activeFunctionName,
  onOpenAiSettings,
}) => {
  return (
    <header className="glass-nav-top w-full h-12 px-4 flex items-center justify-between gap-3 select-none z-50 sticky top-0 transition-all">
      {/* Brand & Breadcrumbs (Clean, Unique, Minimalist - exact match to HTML mockup) */}
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Brand */}
        <div
          onClick={() => onPageChange('dashboard')}
          className="flex items-center gap-1.5 cursor-pointer group shrink-0"
        >
          <span className="text-amber-500 font-bold text-sm">⚡</span>
          <span className="font-extrabold text-[13.5px] tracking-tight text-slate-900 dark:text-white">PyDebug</span>
        </div>

        {/* 6000 Online Status Dot */}
        <div className="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-500 font-semibold shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>6000 Online</span>
        </div>

        {/* Dynamic Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-[11.5px] min-w-0 truncate">
          <span className="text-slate-400 opacity-50 shrink-0">/</span>
          {/* File pill */}
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.04] text-slate-800 dark:text-slate-200 font-mono text-[11px] font-semibold shrink-0 cursor-pointer hover:border-indigo-500/40">
            <span>📁</span>
            <span>{activeFileName || 'policy_benefit.py'}</span>
            <span className="text-[8px] opacity-60">▼</span>
          </div>
          <span className="text-slate-400 opacity-50 shrink-0">/</span>
          <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 truncate">
            {activeFunctionName ? `${activeFunctionName}()` : 'get_all_policy_benefits()'}
          </span>
        </nav>
      </div>

      {/* Right Controls: AI Engine chip + Theme toggle (no duplicate view tabs) */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onOpenAiSettings}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.04] hover:bg-slate-200/50 dark:hover:bg-white/[0.08] text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all cursor-pointer shadow-xs"
          title="Configure AI Engine"
        >
          <span className="text-amber-400">✨</span>
          <span>AI Engine</span>
        </button>

        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.04] hover:bg-slate-200/50 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <span>☀️</span> : <span>🌙</span>}
        </button>
      </div>
    </header>
  );
};

export default Navbar;
