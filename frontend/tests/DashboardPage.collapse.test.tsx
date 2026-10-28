import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DashboardPage } from '../src/pages/DashboardPage';

const mockSessions = [
  {
    id: 'sess_1',
    title: 'POST /api/claims/adjudicate',
    created_at: '2026-10-26T12:00:00Z',
    tag: 'FastAPI Endpoint',
    status: '200 OK',
    first_func: 'adjudicate_claim',
    stats: { total_events: 42, duration_ms: 18.5 },
  },
];

describe('DashboardPage collapse repro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/sessions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSessions) });
      }
      if (url.startsWith('/api/session')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'sess_1',
              title: 'POST /api/claims/adjudicate',
              created_at: '2026-10-26T12:00:00Z',
              files: ['app.py'],
              file_sources: { 0: ['def adjudicate_claim():', '    return 1'] },
              events: [
                {
                  seq: 0,
                  timestamp: 1, kind: 'call', file_idx: 0, line: 1,
                  func: 'adjudicate_claim', depth: 1, src: 'def adjudicate_claim():',
                  vars: {}, vars_diff: {}, return_val: '1', expressions: [],
                },
                {
                  seq: 1,
                  timestamp: 2, kind: 'return', file_idx: 0, line: 2, func: 'adjudicate_claim',
                  depth: 1, src: '    return 1', vars: {}, vars_diff: {}, return_val: '1',
                  expressions: [],
                },
              ],
              stats: { total_events: 2, files_count: 1, max_depth: 1, duration_ms: 1000 },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  it('stays expanded across 10s of session polling', async () => {
    render(<DashboardPage onSelectSession={vi.fn()} />);

    // wait for sessions + trace load
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(screen.getByText('Replay Timeline')).toBeInTheDocument();

    // user collapses then expands the first row to be sure we land expanded
    const rowTitle = screen.getAllByText('POST /api/claims/adjudicate')[0];
    await act(async () => { fireEvent.click(rowTitle); });   // collapse
    await act(async () => { fireEvent.click(rowTitle); });   // expand

    expect(screen.getByText('Replay Timeline')).toBeInTheDocument();

    // advance past several poll ticks (2.5s each) and any pending fetches
    for (let i = 0; i < 6; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    }

    // STILL expanded after ~12s of polling
    expect(screen.getByText('Replay Timeline')).toBeInTheDocument();
  });
});
