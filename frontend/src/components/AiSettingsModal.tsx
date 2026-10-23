import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Zap,
  Key,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Cpu,
  Save,
  Check
} from 'lucide-react';
import type { AIProviderConfig, AIConnectionResult } from '../types';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: AIProviderConfig) => void;
}

const PROVIDER_PRESETS: Record<string, { label: string; desc: string; defaultUrl: string; defaultModel: string; models: string[]; requiresKey: boolean; icon: string }> = {
  ollama: {
    label: 'Ollama',
    desc: 'Local or network Ollama daemon (no API key required)',
    defaultUrl: 'http://127.0.0.1:11434',
    defaultModel: 'qwen2.5:7b-instruct',
    models: ['qwen2.5:7b-instruct', 'llama3.1:8b', 'mistral:7b', 'deepseek-r1:8b', 'phi4:14b'],
    requiresKey: false,
    icon: '🦙',
  },
  openai: {
    label: 'OpenAI',
    desc: 'Official OpenAI cloud API (GPT-4o, GPT-4o-mini)',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresKey: true,
    icon: '⚡',
  },
  deepseek: {
    label: 'DeepSeek',
    desc: 'DeepSeek V3 Chat & DeepSeek R1 Reasoning APIs',
    defaultUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
    icon: '🐋',
  },
  custom: {
    label: 'Custom API',
    desc: 'Groq, OpenRouter, Together AI, vLLM, or LM Studio',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'qwen/qwen-2.5-72b-instruct'],
    requiresKey: true,
    icon: '🔮',
  },
};

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const [provider, setProvider] = useState<'ollama' | 'openai' | 'deepseek' | 'custom'>('ollama');
  const [baseUrl, setBaseUrl] = useState<string>('http://127.0.0.1:11434');
  const [model, setModel] = useState<string>('qwen2.5:7b-instruct');
  const [apiKey, setApiKey] = useState<string>('');
  const [hasExistingKey, setHasExistingKey] = useState<boolean>(false);
  const [maskedKey, setMaskedKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>(PROVIDER_PRESETS.ollama.models);

  const [fetchingModels, setFetchingModels] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<AIConnectionResult | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Fetch current active config from backend on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchConfig = async () => {
      setTestResult(null);
      setSaveSuccess(false);
      try {
        const res = await fetch('/api/ai/config');
        if (res.ok) {
          const cfg: AIProviderConfig = await res.json();
          setProvider(cfg.provider);
          setBaseUrl(cfg.base_url);
          setModel(cfg.model);
          setHasExistingKey(!!cfg.has_api_key);
          setMaskedKey(cfg.api_key_masked || '');
          const preset = PROVIDER_PRESETS[cfg.provider] || PROVIDER_PRESETS.custom;
          setAvailableModels(preset.models.includes(cfg.model) ? preset.models : [cfg.model, ...preset.models]);
          setIsCustomModel(!preset.models.includes(cfg.model));
        }
      } catch (err) {
        console.error('Failed to load AI config:', err);
      }
    };

    fetchConfig();
  }, [isOpen]);

  // Handle provider tab change
  const handleSelectProvider = (newProv: 'ollama' | 'openai' | 'deepseek' | 'custom') => {
    setProvider(newProv);
    const preset = PROVIDER_PRESETS[newProv];
    setBaseUrl(preset.defaultUrl);
    setModel(preset.defaultModel);
    setAvailableModels(preset.models);
    setIsCustomModel(false);
    setTestResult(null);
    setSaveSuccess(false);
  };

  // Fetch models dynamically from provider
  const handleFetchModels = async () => {
    setFetchingModels(true);
    setTestResult(null);
    try {
      const q = new URLSearchParams({ provider, base_url: baseUrl });
      const res = await fetch(`/api/ai/models?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          if (!data.models.includes(model)) {
            setModel(data.models[0]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to query models from provider:', e);
    } finally {
      setFetchingModels(false);
    }
  };

  // Test live connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const payload: Record<string, any> = {
        provider,
        base_url: baseUrl,
        model,
      };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      } else if (hasExistingKey) {
        payload.api_key = 'KEEP_EXISTING';
      }

      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: AIConnectionResult = await res.json();
      setTestResult(data);
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latency_ms: 0,
        message: err.message || 'Network error while attempting connection.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Save config to backend
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const payload: Record<string, any> = {
        provider,
        base_url: baseUrl,
        model,
      };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      } else if (hasExistingKey) {
        payload.api_key = 'KEEP_EXISTING';
      }

      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSaveSuccess(true);
        if (onConfigSaved && data.config) {
          onConfigSaved(data.config);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (e) {
      console.error('Failed to save AI config:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#090e1a] border border-slate-200 dark:border-white/[0.12] rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/50 dark:bg-[#070b14]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">AI Co-Pilot Settings</h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  Multi-Provider
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connect local Ollama or cloud LLMs for live runtime explanations and suggestions.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Provider Selection Grid */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
              1. Select LLM Engine Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(Object.keys(PROVIDER_PRESETS) as Array<'ollama' | 'openai' | 'deepseek' | 'custom'>).map((key) => {
                const p = PROVIDER_PRESETS[key];
                const isSelected = provider === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectProvider(key)}
                    className={`flex flex-col items-center text-center p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-slate-900 dark:text-white shadow-sm shadow-indigo-500/20'
                        : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.16] bg-slate-50/50 dark:bg-[#070b14]/40 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-2xl mb-1.5">{p.icon}</span>
                    <span className="text-xs font-semibold">{p.label}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.desc.split('(')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Parameters */}
          <div className="space-y-4 pt-1">
            {/* Base URL */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-500" />
                  <span>API Base Endpoint URL</span>
                </label>
                <button
                  type="button"
                  onClick={() => setBaseUrl(PROVIDER_PRESETS[provider].defaultUrl)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Reset to default
                </button>
              </div>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={PROVIDER_PRESETS[provider].defaultUrl}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#050811] border border-slate-200 dark:border-white/[0.12] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* API Key (if required or custom) */}
            {PROVIDER_PRESETS[provider].requiresKey && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>API Secret Key</span>
                  </label>
                  {hasExistingKey && !apiKey && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                      Current: {maskedKey}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasExistingKey ? 'Leave blank to retain saved key, or type new key...' : 'sk-...'}
                    className="w-full pr-10 pl-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#050811] border border-slate-200 dark:border-white/[0.12] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Model Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-violet-500" />
                  <span>Target LLM Model</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchingModels}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                    <span>Discover Models</span>
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomModel(!isCustomModel)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {isCustomModel ? 'Pick from list' : 'Custom model name'}
                  </button>
                </div>
              </div>

              {isCustomModel ? (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. qwen2.5:14b or gpt-4o"
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#050811] border border-slate-200 dark:border-white/[0.12] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              ) : (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#050811] border border-slate-200 dark:border-white/[0.12] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Test Connection Output Banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-mono transition-all flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/[0.08] border-rose-500/30 text-rose-800 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>{testResult.success ? 'Connection Successful' : 'Connection Failed'}</span>
                  {testResult.latency_ms > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
                      {testResult.latency_ms} ms ping
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-90">{testResult.message}</div>
                {testResult.models && testResult.models.length > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans pt-1">
                    Found {testResult.models.length} model(s): {testResult.models.slice(0, 5).join(', ')}
                    {testResult.models.length > 5 ? '...' : ''}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#070b14]/80 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection || saving}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-white/[0.12] transition-colors disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-500 ${testingConnection ? 'animate-pulse' : ''}`} />
            <span>{testingConnection ? 'Testing Connection...' : 'Test Connection'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
