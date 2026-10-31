export interface SubExpression {
  text: string;
  val: string;
  type_name?: string;
  is_bool?: boolean;
  bool_val?: boolean | null;
  truthy?: boolean;
  is_container?: boolean;
  length?: number;
  items_preview?: string[] | Record<string, string>;
  start_col?: number;
  end_col?: number;
  line?: number;
  node_type?: string;
}

export interface TraceEvent {
  seq: number;
  timestamp: number;
  kind: 'call' | 'line' | 'return' | 'exception';
  file_idx: number;
  line: number;
  func: string;
  depth: number;
  src: string;
  vars: Record<string, string>;
  vars_diff: Record<string, { old: string; new: string }>;
  return_val?: string | null;
  exc_type?: string | null;
  exc_val?: string | null;
  expressions?: SubExpression[];
}

export interface TraceSession {
  id: string;
  title: string;
  created_at: string;
  files: string[];
  file_sources: Record<number, string[]>;
  events: TraceEvent[];
  stats: {
    total_events: number;
    files_count: number;
    calls_count?: number;
    returns_count?: number;
    exceptions_count?: number;
    max_depth: number;
    duration_ms: number;
    has_uncaught_error?: boolean;
    error_line?: number;
    error_file?: string;
    error_type?: string;
    error_message?: string;
  };
}

export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  tag: 'FastAPI Endpoint' | 'MCP Tool' | 'Python Script' | 'Playground Run';
  status: string;
  first_func?: string;
  stats: {
    total_events: number;
    duration_ms: number;
    calls_count: number;
    exceptions_count: number;
    max_depth: number;
  };
}

export interface PinnedExpression {
  id: string;
  text: string;
  line: number;
  func: string;
  val: string;
  type_name: string;
  pinnedAtEventSeq: number;
}

export type ThemeMode = 'dark' | 'light';

export type PageId = 'dashboard' | 'hunter' | 'birdseye' | 'playground';

export interface FunctionParam {
  name: string;
  annotation: string | null;
  default?: string | null;
}

export interface FunctionSignature {
  name: string;
  line: number;
  params: FunctionParam[];
  docstring: string;
  file_path: string;
  is_async?: boolean;
  sample_valid?: Record<string, any>;
  sample_invalid?: Record<string, any>;
}

export interface AiExplanation {
  explanation: string;
  suggestion: string;
  provider?: string;
  model?: string;
  cached?: boolean;
}

export interface AIProviderConfig {
  provider: 'ollama' | 'openai' | 'deepseek' | 'custom';
  base_url: string;
  model: string;
  temperature?: number;
  has_api_key?: boolean;
  api_key_masked?: string;
}

export interface AIConnectionResult {
  success: boolean;
  latency_ms: number;
  message: string;
  models?: string[];
}

export interface TestCase {
  id: string;
  name: string;
  function_name: string;
  file_path: string;
  args: Record<string, any>;
  expected_return?: string;
}
