import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardPage } from '../src/pages/DashboardPage';

describe('DashboardPage Component', () => {
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
    {
      id: 'sess_2',
      title: '[MCP] claimcare_verify_waiting_period',
      created_at: '2026-10-26T12:05:00Z',
      tag: 'MCP Tool',
      status: 'Error',
      first_func: 'verify_period',
      stats: { total_events: 10, duration_ms: 5.2 },
    },
  ];

  const mockFunctions = [
    {
      name: 'check_waiting_period',
      line: 45,
      docstring: 'Verifies PED exclusions.',
      file_path: 'C:/app/services/ped.py',
      is_async: false,
      params: [{ name: 'policy_id', annotation: 'str' }],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/sessions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSessions),
        });
      }
      if (url === '/api/functions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockFunctions),
        });
      }
      if (url.startsWith('/api/session')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'sess_1', events: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders sessions list fetched from backend', async () => {
    const onSelectSession = vi.fn();
    render(<DashboardPage onSelectSession={onSelectSession} />);

    await waitFor(() => {
      expect(screen.getByText('[MCP] claimcare_verify_waiting_period')).toBeInTheDocument();
      expect(screen.getByText('POST /api/claims/adjudicate')).toBeInTheDocument();
    });
  });

  it('filters sessions by search query input', async () => {
    render(<DashboardPage onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('[MCP] claimcare_verify_waiting_period')).toBeInTheDocument();
      expect(screen.getByText('POST /api/claims/adjudicate')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/filter executions/i);
    fireEvent.change(searchInput, { target: { value: 'claimcare_verify' } });

    expect(screen.getByText('[MCP] claimcare_verify_waiting_period')).toBeInTheDocument();
    expect(screen.queryByText('POST /api/claims/adjudicate')).not.toBeInTheDocument();
  });

  it('triggers onSelectSession when clicking Replay Timeline', async () => {
    const onSelectSession = vi.fn();
    render(<DashboardPage onSelectSession={onSelectSession} />);

    await waitFor(() => {
      expect(screen.getByText('Replay Timeline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Replay Timeline'));
    expect(onSelectSession).toHaveBeenCalledWith('sess_1', 'hunter');
  });

  it('triggers onTryFunction when clicking Try It Live on a discovered function', async () => {
    const onTryFunction = vi.fn();
    render(<DashboardPage onSelectSession={vi.fn()} onTryFunction={onTryFunction} />);

    await waitFor(() => {
      expect(screen.getByText('check_waiting_period()')).toBeInTheDocument();
    });

    const tryBtn = screen.getByText('Try It Live');
    fireEvent.click(tryBtn);

    expect(onTryFunction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'check_waiting_period' })
    );
  });
});
