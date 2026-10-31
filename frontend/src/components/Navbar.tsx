import React from 'react';
import { 
  Zap, 
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
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 group-hover:scale-105 transition-transform duration-200">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">PyDebug</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 font-mono">
                v0.1.6
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
              className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
                isActive
                  ? 'bg-white dark:bg-[#0c1220] text-indigo-700 dark:text-indigo-300 shadow-sm font-bold border border-slate-300 dark:border-indigo-500/40 ring-1 ring-indigo-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
              title={item.desc}              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-300 fill-current' : 'text-slate-400'}`} />
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
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-100/90 dark:bg-[#050811] hover:bg-slate-200 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 hover:border-indigo-500/50 transition-all cursor-pointer shadow-xs group"
        >
          <Bot className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
          <span className="font-sans text-[11px] font-medium capitalize">
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
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-white/[0.08] transition-colors shadow-xs"
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
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-white/[0.08] transition-colors shadow-xs"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600" />
          )}
        </button>
      </div>
    </header>
  );
};
