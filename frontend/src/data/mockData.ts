import type { TraceSession } from '../types';

export const MOCK_TRACE_SESSION: TraceSession = {
  id: 'ready',
  title: 'ClaimCare MCP Server (Ready to Trace)',
  created_at: new Date().toISOString(),
  files: [
    'app.py'
  ],
  file_sources: {
    0: [
      '# PyDebug Live Studio is online and connected.',
      '# Run any function from Code Sandbox, or trace your live server via `uv run pydebug run server/run_server.py`.',
      '# Traces will appear here in real time.'
    ]
  },
  events: [
    {
      seq: 0,
      kind: 'line',
      line: 1,
      file_idx: 0,
      func: 'ready',
      depth: 0,
      src: '# PyDebug Live Studio is online and connected.',
      vars: { status: '"READY_FOR_TRACING"' },
      vars_diff: { status: { old: '', new: '"READY_FOR_TRACING"' } },
      timestamp: 1000.0,
      expressions: []
    }
  ],
  stats: {
    total_events: 1,
    files_count: 1,
    duration_ms: 0.1,
    max_depth: 1,
    has_uncaught_error: false
  }
};
