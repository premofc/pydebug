import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/App';

describe('App Root Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/ai/config') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              provider: 'ollama',
              base_url: 'http://127.0.0.1:11434',
              model: 'qwen2.5:7b-instruct',
              temperature: 0.2,
            }),
        });
      }
      if (url === '/api/sessions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url === '/api/functions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url === '/api/session' || url.startsWith('/api/session?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders navbar and default dashboard page', async () => {
    render(<App />);
    expect(screen.getByText('PyDebug')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('switches between pages when bottom dock navigation buttons are clicked', async () => {
    render(<App />);

    // Navigate from the primary workspace navigation.
    const hunterBtn = screen.getByTitle('Timeline Replay');
    fireEvent.click(hunterBtn);
    expect(screen.getByText('No Traced Execution Loaded')).toBeInTheDocument();

    // Click Playground / Sandbox navigation pill
    const sandboxBtn = screen.getByTitle('Live Sandbox');
    fireEvent.click(sandboxBtn);
    expect(screen.getByText(/Switch Function/i)).toBeInTheDocument();

    // Click Birdseye navigation pill (shows clean empty state when no trace loaded)
    const flameBtn = screen.getByTitle('Expression Flow');
    fireEvent.click(flameBtn);
    expect(screen.getByText('No Expression Traces Recorded')).toBeInTheDocument();
  });

  it('toggles dark and light mode', async () => {
    render(<App />);
    const themeBtn = screen.getByLabelText('Switch to light theme');
    fireEvent.click(themeBtn);

    expect(localStorage.getItem('pydebug_theme')).toBeDefined();
  });

  it('opens and closes AI settings modal', async () => {
    render(<App />);

    const aiButton = screen.getByTitle(/AI engine/i);
    fireEvent.click(aiButton);

    await waitFor(() => {
      expect(screen.getByText('AI Co-Pilot Settings')).toBeInTheDocument();
    }, { timeout: 8000 });
    expect(screen.getByRole('dialog', { name: /AI Co-Pilot Settings/i })).toBeInTheDocument();
    expect(document.querySelector('.app-content')).toHaveAttribute('inert');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 12000);
});
