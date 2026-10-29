import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HunterPage } from '../src/pages/HunterPage';
import type { TraceSession } from '../types';

describe('HunterPage Component', () => {
  const emptySession: TraceSession = {
    id: '',
    title: '',
    files: [],
    file_sources: {},
    events: [],
    stats: {
      total_events: 0,
      files_count: 0,
      duration_ms: 0,
      max_depth: 0,
      has_uncaught_error: false,
    },
  };

  const normalSession: TraceSession = {
    id: 'sess_normal_1',
    title: 'test_normal_run',
    files: ['compute.py'],
    file_sources: {
      0: [
        'def compute(a, b):',
        '    total = (a + b) * 2',
        '    return total',
      ],
    },
    events: [
      {
        seq: 0,
        timestamp: 100.1,
        kind: 'line',
        file_idx: 0,
        line: 1,
        func: 'compute',
        depth: 1,
        src: 'def compute(a, b):',
        vars: { a: '10', b: '20' },
        vars_diff: {},
      },
      {
        seq: 1,
        timestamp: 100.2,
        kind: 'line',
        file_idx: 0,
        line: 2,
        func: 'compute',
        depth: 1,
        src: '    total = (a + b) * 2',
        vars: { a: '10', b: '20', total: '60' },
        vars_diff: { total: { old: '', new: '60' } },
      },
      {
        seq: 2,
        timestamp: 100.3,
        kind: 'return',
        file_idx: 0,
        line: 3,
        func: 'compute',
        depth: 1,
        src: '    return total',
        vars: { a: '10', b: '20', total: '60' },
        vars_diff: {},
        return_val: '60',
      },
    ],
    created_at: '2026-10-26T12:00:00Z',
    stats: {
      total_events: 3,
      files_count: 1,
      duration_ms: 10.0,
      max_depth: 1,
      has_uncaught_error: false,
    },
  };

  const exceptionSession: TraceSession = {
    ...normalSession,
    id: 'sess_exc_1',
    events: [
      normalSession.events[0],
      normalSession.events[1],
      {
        seq: 2,
        timestamp: 100.3,
        kind: 'exception',
        file_idx: 0,
        line: 3,
        func: 'compute',
        depth: 1,
        src: '    raise ValueError("Too large")',
        vars: { a: '10', b: '20', total: '60' },
        vars_diff: {},
        exc_type: 'ValueError',
        exc_val: 'Too large',
      },
    ],
    stats: {
      ...normalSession.stats,
      has_uncaught_error: true,
      error_line: 3,
      error_type: 'ValueError',
      error_message: 'Too large',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when no events exist', () => {
    const onOpenSandbox = vi.fn();
    render(<HunterPage session={emptySession} onOpenSandbox={onOpenSandbox} />);
    expect(screen.getByText('No Traced Execution Loaded')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /open live sandbox/i });
    fireEvent.click(btn);
    expect(onOpenSandbox).toHaveBeenCalled();
  });

  it('renders source code lines and active event step', () => {
    render(<HunterPage session={normalSession} />);
    expect(screen.getByText('def compute(a, b):')).toBeInTheDocument();
    expect(screen.getByText('total = (a + b) * 2')).toBeInTheDocument();
  });

  it('navigates timeline forward and backward', () => {
    render(<HunterPage session={normalSession} />);

    // Step 0 shows event #1
    expect(screen.getByText(/#1/)).toBeInTheDocument();

    // Step forward button
    const stepFwdBtn = screen.getByTitle(/step forward/i);
    fireEvent.click(stepFwdBtn);

    // Step 1 shows event #2
    expect(screen.getByText(/#2/)).toBeInTheDocument();

    // Step backward button
    const stepBackBtn = screen.getByTitle(/step backward/i);
    fireEvent.click(stepBackBtn);

    // Returns to step 0 (#1)
    expect(screen.getByText(/#1/)).toBeInTheDocument();
  });

  it('displays exception event indicators when active event is an exception', () => {
    // When session has an uncaught error, HunterPage auto-focuses on it
    render(<HunterPage session={exceptionSession} />);

    // Auto-focuses on step 3 (#3) where exception occurred
    expect(screen.getByText(/#3/)).toBeInTheDocument();
    expect(screen.getByText('exception')).toBeInTheDocument();
  });

  it('switches tabs to Call Stack and AI tabs', async () => {
    render(<HunterPage session={normalSession} />);

    // Switch to Call Stack tab
    const stackTab = screen.getByRole('button', { name: /call stack/i });
    fireEvent.click(stackTab);
    expect(screen.getByText(/Active execution call frames/i)).toBeInTheDocument();

    // Switch to AI tab
    const aiTab = screen.getByRole('button', { name: /ai co-pilot/i });
    fireEvent.click(aiTab);

    await waitFor(() => {
      expect(screen.getByText(/ANALYZING LINE/i)).toBeInTheDocument();
    });
  });

  it('calls onEventChange when step changes', () => {
    const onEventChange = vi.fn();
    render(<HunterPage session={normalSession} onEventChange={onEventChange} />);

    const stepFwdBtn = screen.getByTitle(/step forward/i);
    fireEvent.click(stepFwdBtn);
    expect(onEventChange).toHaveBeenCalled();
  });
});
