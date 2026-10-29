import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BirdseyePage } from '../src/pages/BirdseyePage';
import type { TraceSession } from '../types';

describe('BirdseyePage Component', () => {
  const emptySession: TraceSession = {
    id: '',
    title: '',
    files: [],
    file_sources: {},
    events: [],
    stats: { total_events: 0, files_count: 0, max_depth: 0, duration_ms: 0 },
  };

  const mockSession: TraceSession = {
    id: 'sess_birdseye',
    title: 'Birdseye Deep Expression Session',
    created_at: '2026-10-26T12:00:00Z',
    files: ['C:/app/math.py'],
    file_sources: {
      0: [
        'def solve(x, y):',
        '    if x > 2:',
        '        return (x + 2) * (y - 1)',
        '    return 0',
      ],
    },
    events: [
      {
        seq: 0,
        timestamp: 10.0,
        kind: 'call',
        file_idx: 0,
        line: 1,
        func: 'solve',
        depth: 1,
        src: 'def solve(x, y):',
        vars: { x: '5', y: '3' },
        vars_diff: {},
        expressions: [],
      },
      {
        seq: 1,
        timestamp: 10.05,
        kind: 'line',
        file_idx: 0,
        line: 2,
        func: 'solve',
        depth: 1,
        src: '    if x > 2:',
        vars: { x: '5', y: '3' },
        vars_diff: {},
        expressions: [
          { text: 'x > 2', val: 'True', line: 2, start_col: 7, end_col: 12, node_type: 'compare' },
        ],
      },
      {
        seq: 2,
        timestamp: 10.1,
        kind: 'return',
        file_idx: 0,
        line: 3,
        func: 'solve',
        depth: 1,
        src: '        return (x + 2) * (y - 1)',
        vars: { x: '5', y: '3' },
        vars_diff: {},
        return_val: '14',
        expressions: [
          { text: 'x + 2', val: '7', line: 3, start_col: 15, end_col: 20, node_type: 'bin_op' },
          { text: 'y - 1', val: '2', line: 3, start_col: 25, end_col: 30, node_type: 'bin_op' },
          { text: '(x + 2) * (y - 1)', val: '14', line: 3, start_col: 14, end_col: 31, node_type: 'bin_op' },
        ],
      },
    ],
    stats: { total_events: 3, files_count: 1, max_depth: 1, duration_ms: 100.0 },
  };

  it('renders empty state when no calls exist', () => {
    const onOpenSandbox = vi.fn();
    render(<BirdseyePage session={emptySession} onOpenSandbox={onOpenSandbox} />);
    expect(screen.getByText('No Expression Traces Recorded')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /open live sandbox/i });
    fireEvent.click(btn);
    expect(onOpenSandbox).toHaveBeenCalled();
  });

  it('renders function call hierarchy and source lines', () => {
    render(<BirdseyePage session={mockSession} />);
    expect(screen.getAllByText('solve()').length).toBeGreaterThan(0);
    expect(screen.getByText('def solve(x, y):')).toBeInTheDocument();
  });

  it('renders branch indicator and boolean highlights', () => {
    render(<BirdseyePage session={mockSession} />);
    expect(screen.getByText(/Branch Taken \(True\)/i)).toBeInTheDocument();
    expect(screen.getByText(/✔ True/)).toBeInTheDocument();
  });

  it('filters call records by search input', () => {
    render(<BirdseyePage session={mockSession} />);
    expect(screen.getAllByText('solve()').length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText(/search functions/i);
    fireEvent.change(searchInput, { target: { value: 'non_existent_func' } });

    // Sidebar call list is filtered out; only the center header still shows the active call name
    expect(screen.getAllByText('solve()')).toHaveLength(1);
  });

  it('switches tabs to local variables and pinned items', () => {
    render(<BirdseyePage session={mockSession} />);

    // Click Locals tab
    const localsTab = screen.getByRole('button', { name: /locals/i });
    fireEvent.click(localsTab);
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
  });
});
