import React from 'react';
import { Activity, Bot, Bug, Code2, Eye, FlaskConical, Moon, Sun } from 'lucide-react';
import type { ThemeMode, AIProviderConfig, PageId } from '../types';

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  currentPage: PageId;
  onPageChange: (page: PageId) => void;
  stats?: { total_events: number; duration_ms: number; max_depth: number };
  isConnected?: boolean;
  sessionId?: string;
  activeFileName?: string;
  activeFunctionName?: string;
  aiConfig?: AIProviderConfig | null;
  onOpenAiSettings?: () => void;
}

const pages: { id: PageId; label: string; shortLabel: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Overview', shortLabel: 'Home', icon: Activity },
  { id: 'hunter', label: 'Timeline Replay', shortLabel: 'Replay', icon: Bug },
  { id: 'birdseye', label: 'Expression Flow', shortLabel: 'Flow', icon: Eye },
  { id: 'playground', label: 'Live Sandbox', shortLabel: 'Sandbox', icon: FlaskConical },
];

export const Navbar: React.FC<NavbarProps> = ({
  theme, onToggleTheme, currentPage, onPageChange, isConnected = false,
  activeFileName, activeFunctionName, aiConfig, onOpenAiSettings,
}) => (
  <header className="top-navbar">
    <button type="button" className="brand-link" onClick={() => onPageChange('dashboard')} aria-label="PyDebug home">
      <span className="brand-mark"><Code2 size={17} strokeWidth={2.5} /></span>
      <span className="brand-name">PyDebug<span className="brand-studio">STUDIO</span></span>
    </button>

    <nav className="primary-nav" aria-label="Primary">
      {pages.map(({ id, label, shortLabel, icon: Icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => onPageChange(id)}
          className={`primary-nav-item ${currentPage === id ? 'active' : ''}`}
          aria-current={currentPage === id ? 'page' : undefined}
          title={label}
        >
          <Icon size={15} strokeWidth={1.9} />
          <span className="nav-full-label">{label}</span>
          <span className="nav-short-label">{shortLabel}</span>
        </button>
      ))}
    </nav>

    <div className="nav-right">
      {activeFileName && (
        <div className="nav-context" title={activeFunctionName ? `${activeFileName} · ${activeFunctionName}()` : activeFileName}>
          <span className="context-file">{activeFileName}</span>
          {activeFunctionName && <><span className="context-divider">/</span><span className="context-function">{activeFunctionName}()</span></>}
        </div>
      )}
      <div className={`connection-status ${isConnected ? 'connected' : ''}`} title={isConnected ? 'Connected to the local tracer' : 'Waiting for the local tracer'}>
        <span className="connection-indicator" />
        <span>{isConnected ? 'Connected' : 'Offline'}</span>
      </div>
      <button type="button" onClick={onOpenAiSettings} className="nav-action ai-action" aria-label="AI engine settings" aria-haspopup="dialog" aria-controls="ai-settings-dialog" title={aiConfig?.model ? `AI engine · ${aiConfig.model}` : 'Configure AI engine'}>
        <Bot size={16} />
        <span>AI engine</span>
      </button>
      <button type="button" onClick={onToggleTheme} className="nav-action theme-action" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  </header>
);

export default Navbar;
