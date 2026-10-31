import React from 'react';
import { 
  Sun, 
  Moon, 
  Clock, 
  Activity,
  FileCode,
  Eye,
  Play,
  FlaskConical,
  LayoutDashboard,
  Bot
} from 'lucide-react';
import type { ThemeMode, AIProviderConfig, PageId } from '../types';

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  currentPage: PageId;
  onPageChange: (page: PageId) => void;
  stats: {
    total_events: number;
    duration_ms: number;
    max_depth: number;
  };
  isConnected: boolean;
  sessionId?: string;
  activeFileName?: string;
  activeFunctionName?: string;
  aiConfig?: AIProviderConfig | null;
  onOpenAiSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  onToggleTheme,
  currentPage,
  onPageChange,
  stats,
  isConnected: _isConnected,
  sessionId: _sessionId,
  activeFileName,
  activeFunctionName,
  aiConfig,
  onOpenAiSettings,
}) => {


  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard, desc: 'Traced Sessions & Operations' },
    { id: 'hunter' as const, label: 'Timeline Replay', icon: Play, desc: 'Step-by-Step VCR Line Replay' },
    { id: 'birdseye' as const, label: 'Expression Flow', icon: Eye, desc: 'Expression & Condition Flow Inspector' },
    { id: 'playground' as const, label: 'Live Sandbox', icon: FlaskConical, desc: 'Interactive Function Runner & Sandbox' },
  ];

  return (
    <header className="h-14 border-b border-slate-200/80 dark:border-white/[0.06] bg-white/95 dark:bg-[#060911]/90 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between gap-3 select-none z-40 sticky top-0 transition-all">
      {/* Brand & Active Context */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand Logo */}
        <div 
          onClick={() => onPageChange('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-0.5 shadow-md shadow-indigo-500/20 group-hover:shadow-indigo-500/40 border border-indigo-500/30 group-hover:scale-105 transition-all duration-200 flex items-center justify-center">
            <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pydebug-g1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="pydebug-g2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>
              <path
                d="M16 3C9.37 3 9 5.86 9 8.5V12H16V13.5H6.5C3.86 13.5 2 15.37 2 20C2 24.63 4.37 26.5 7 26.5H10.5V23C10.5 20.37 12.37 18.5 15 18.5H22V16.5C22 13.86 20.13 12 17.5 12H13.5V8.5C13.5 5.86 15.37 3 16 3Z"
                fill="url(#pydebug-g1)"
                opacity="0.95"
              />
              <path
                d="M16 29C22.63 29 23 26.14 23 23.5V20H16V18.5H25.5C28.14 18.5 30 16.63 30 12C30 7.37 27.63 5.5 25 5.5H21.5V9C21.5 11.63 19.63 13.5 17 13.5H10V15.5C10 18.14 11.87 20 14.5 20H18.5V23.5C18.5 26.14 16.63 29 16 29Z"
                fill="url(#pydebug-g2)"
                opacity="0.95"
              />
              <circle cx="11.5" cy="7.5" r="1.5" fill="#ffffff" />
              <circle cx="20.5" cy="24.5" r="1.5" fill="#ffffff" />
              <circle cx="16" cy="16" r="2" fill="#38bdf8" />
            </svg>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">PyDebug</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 font-mono">
                v0.2.0
              </span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wide">STUDIO</span>
          </div>
        </div>



        {/* Active Trace File Breadcrumb (visible on 2xl+ to prevent collision with mode switcher) */}
        <div className="hidden 2xl:flex items-center gap-2 text-xs font-mono bg-slate-100/80 dark:bg-[#050811]/60 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-white/[0.08] max-w-[190px] shrink min-w-0 overflow-hidden">
          <FileCode className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
          {activeFileName && !activeFileName.includes("demo_") ? (
            <div className="flex items-center gap-1 min-w-0 truncate">
              <span className="text-slate-800 dark:text-slate-200 font-medium truncate">{activeFileName}</span>
              {activeFunctionName && (
                <>
                  <span className="text-slate-400 shrink-0">/</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate">{activeFunctionName}()</span>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 min-w-0 truncate">
              <span className="text-slate-700 dark:text-slate-300 font-medium font-sans truncate">ClaimCare MCP Workspace</span>
              <span className="text-emerald-500 font-medium text-[11px] font-sans shrink-0">• Ready</span>
            </div>
          )}
        </div>
      </div>

      {/* Center: Segmented Navigation Pill */}
      <nav
        aria-label="Mode Switcher"
        className="flex items-center gap-1 bg-slate-100 dark:bg-[#050811] p-1 rounded-2xl border border-slate-300 dark:border-white/[0.08] shadow-xs shrink-0 mx-2"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`group flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
                isActive
                  ? 'bg-white dark:bg-[#0c1220] text-indigo-600 dark:text-indigo-300 shadow-sm border border-slate-200/90 dark:border-indigo-500/40 ring-1 ring-indigo-500/20 scale-[1.02]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 hover:scale-[1.01] active:scale-[0.98]'
              }`}
              title={item.desc}              aria-current={isActive ? 'page' : undefined}
            >
              <Icon strokeWidth={isActive ? 2.3 : 2} className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isActive ? 'text-indigo-600 dark:text-indigo-400 scale-110' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Metrics, AI Settings, GitHub & Controls */}
      <div className="flex items-center gap-2.5">
        {/* AI Provider Config Pill */}
        <button
          onClick={onOpenAiSettings}
          title={`Active AI: ${aiConfig?.provider || 'Ollama'} (${aiConfig?.model || 'qwen2.5:7b-instruct'}) - Click to configure LLMs`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono bg-slate-100/90 dark:bg-[#050811] hover:bg-slate-200/80 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 hover:border-indigo-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-2xs group"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <Bot strokeWidth={2.2} className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
          <span className="font-sans text-[11px] font-semibold capitalize">
            {aiConfig?.provider || 'Ollama'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[85px] hidden md:inline">
            {aiConfig?.model ? aiConfig.model.split(':')[0] : 'qwen2.5'}
          </span>
        </button>

        {/* Real-time Metrics Pill */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100/80 dark:bg-[#050811] border border-slate-200 dark:border-white/[0.08]">
            <Activity className="w-3 h-3 text-indigo-500" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.total_events}</span>
            <span className="text-[10px] text-slate-400 font-sans">ev</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100/80 dark:bg-[#050811] border border-slate-200 dark:border-white/[0.08]">
            <Clock className="w-3 h-3 text-emerald-500" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.duration_ms.toFixed(1)}</span>
            <span className="text-[10px] text-slate-400 font-sans">ms</span>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

        {/* GitHub Link SVG */}
        <a
          href="https://github.com/premofc/pydebug"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-white/[0.08] hover:scale-105 active:scale-95 transition-all duration-200 shadow-2xs"
          title="View PyDebug on GitHub"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>

        {/* Dark / Light Mode Toggle */}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-white/[0.08] hover:scale-105 active:scale-95 transition-all duration-200 shadow-2xs cursor-pointer"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun strokeWidth={2.2} className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
          ) : (
            <Moon strokeWidth={2.2} className="w-4 h-4 text-indigo-600 transition-transform duration-200 hover:-rotate-12" />
          )}
        </button>
      </div>
    </header>
  );
};
