export interface SubExpression {
  text: string;
  val: string;
  type_name: string;
  start_col: number;
  end_col: number;
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
    calls_count: number;
    returns_count: number;
    exceptions_count: number;
    max_depth: number;
    duration_ms: number;
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

export interface FunctionParam {
  name: string;
  annotation: string | null;
  default: string | null;
}

export interface FunctionSignature {
  name: string;
  line: number;
  params: FunctionParam[];
  docstring: string;
  file_path: string;
}

export interface AiExplanation {
  explanation: string;
  suggestion: string;
  cached?: boolean;
}

export interface TestCase {
  id: string;
  name: string;
  function_name: string;
  file_path: string;
  args: Record<string, any>;
  expected_return?: string;
}
