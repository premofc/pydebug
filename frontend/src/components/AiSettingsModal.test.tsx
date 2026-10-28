import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiSettingsModal } from './AiSettingsModal';

describe('AiSettingsModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <AiSettingsModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with default Ollama provider when open', async () => {
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
              has_api_key: false,
              api_key_masked: '',
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<AiSettingsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('AI Co-Pilot Settings')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('switches to OpenAI and reveals API Key input section', async () => {
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
              has_api_key: false,
              api_key_masked: '',
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<AiSettingsModal isOpen={true} onClose={vi.fn()} />);

    // Click OpenAI provider button
    const openaiBtn = screen.getByText('OpenAI');
    fireEvent.click(openaiBtn);

    // API Key section should now be visible
    expect(screen.getByText(/API Secret Key/i)).toBeInTheDocument();
  });

  it('tests connection and displays feedback', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/ai/test-connection') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              message: 'Connected to Ollama successfully.',
              models: ['qwen2.5:7b-instruct'],
            }),
        });
      }
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
    });

    render(<AiSettingsModal isOpen={true} onClose={vi.fn()} />);

    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Connection Successful')).toBeInTheDocument();
      expect(screen.getByText(/Connected to Ollama successfully/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<AiSettingsModal isOpen={true} onClose={onClose} />);

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
