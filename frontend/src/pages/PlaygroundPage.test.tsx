import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaygroundPage } from './PlaygroundPage';
import type { TraceSession, FunctionSignature } from '../types';

describe('PlaygroundPage Component', () => {
  const dummySession: TraceSession = {
    id: 'sess_init',
    title: 'initial_session',
    files: ['tax.py'],
    file_sources: { 0: ['def calculate_tax(amount, rate=0.1):', '    return amount * rate'] },
    events: [],
    created_at: '2026-10-26T12:00:00Z',
    stats: { total_events: 0, files_count: 1, max_depth: 0, duration_ms: 0 },
  };

  const mockDiscoveredFunctions: FunctionSignature[] = [
    {
      name: 'calculate_tax',
      line: 12,
      docstring: 'Calculates tax based on rate.',
      file_path: 'C:/app/tax.py',
      is_async: false,
      params: [
        { name: 'amount', annotation: 'float', default: null },
        { name: 'rate', annotation: 'float', default: '0.1' },
      ],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/functions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDiscoveredFunctions),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders function picker and loads workspace functions', async () => {
    render(
      <PlaygroundPage
        session={dummySession}
        onSessionUpdated={vi.fn()}
        onNavigateToHunter={vi.fn()}
      />
    );

    expect(screen.getByText('Target Functions')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/calculate_tax/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/tax\.py/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('selects function and populates default sample arguments', async () => {
    render(
      <PlaygroundPage
        session={dummySession}
        onSessionUpdated={vi.fn()}
        onNavigateToHunter={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/calculate_tax/).length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getAllByText(/calculate_tax/)[0]);

    expect(screen.getByText(/Function Arguments \(JSON\)/i)).toBeInTheDocument();
  });

  it('detects invalid JSON in the parameter editor', async () => {
    const { container } = render(
      <PlaygroundPage
        session={dummySession}
        onSessionUpdated={vi.fn()}
        onNavigateToHunter={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/calculate_tax/).length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText(/calculate_tax/)[0]);

    const textarea = container.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: '{ invalid syntax' } });

    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
  });

  it('handles successful function execution and updates session', async () => {
    const onSessionUpdated = vi.fn();
    const updatedSession: TraceSession = {
      ...dummySession,
      id: 'sess_run_123',
      events: [
        {
          seq: 0,
          timestamp: 1.0,
          kind: 'line',
          file_idx: 0,
          line: 12,
          func: 'calculate_tax',
          depth: 1,
          src: 'tax = amount * rate',
          vars: { amount: '100.0', rate: '0.1' },
          vars_diff: {},
        },
      ],
      stats: { total_events: 1, files_count: 1, max_depth: 1, duration_ms: 1.5 },
    };

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/functions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDiscoveredFunctions),
        });
      }
      if (url === '/api/execute-function' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              return_val: '10.0',
              session: updatedSession,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <PlaygroundPage
        session={dummySession}
        onSessionUpdated={onSessionUpdated}
        onNavigateToHunter={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/calculate_tax/).length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText(/calculate_tax/)[0]);

    const executeBtn = screen.getByText('Run Live Execution');
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Execution Succeeded \(200 OK\)/i)).toBeInTheDocument();
      expect(screen.getByText('10.0')).toBeInTheDocument();
      expect(onSessionUpdated).toHaveBeenCalledWith(updatedSession);
    });
  });

  it('handles failure execution with failure line and navigation button', async () => {
    const onNavigateToHunter = vi.fn();
    const failedSession: TraceSession = {
      ...dummySession,
      id: 'sess_err_456',
      events: [
        {
          seq: 0,
          timestamp: 1.0,
          kind: 'exception',
          file_idx: 0,
          line: 14,
          func: 'calculate_tax',
          depth: 1,
          src: 'raise ZeroDivisionError()',
          vars: {},
          vars_diff: {},
          exc_type: 'ZeroDivisionError',
          exc_val: 'division by zero',
        },
      ],
      stats: {
        total_events: 1,
        files_count: 1,
        max_depth: 1,
        duration_ms: 2.1,
        has_uncaught_error: true,
        error_line: 14,
        error_type: 'ZeroDivisionError',
        error_message: 'division by zero',
      },
    };

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/functions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDiscoveredFunctions),
        });
      }
      if (url === '/api/execute-function' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              error: 'ZeroDivisionError: division by zero',
              error_type: 'ZeroDivisionError',
              error_message: 'division by zero',
              error_line: 14,
              session: failedSession,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <PlaygroundPage
        session={dummySession}
        onSessionUpdated={vi.fn()}
        onNavigateToHunter={onNavigateToHunter}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/calculate_tax/).length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText(/calculate_tax/)[0]);

    const executeBtn = screen.getByText('Run Live Execution');
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Exception Trapped: ZeroDivisionError/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed at Line 14/i)).toBeInTheDocument();
    });

    const inspectBtn = screen.getByText('🎯 Inspect Failure Line in Timeline');
    fireEvent.click(inspectBtn);
    expect(onNavigateToHunter).toHaveBeenCalled();
  });
});
