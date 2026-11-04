import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiSettingsModal } from '../src/components/AiSettingsModal';

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
    await waitFor(() => expect(screen.getByRole('button', { name: /Ollama/i })).toBeEnabled());
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

    // Wait for the saved provider config before allowing a user override.
    const openAiButton = screen.getByRole('button', { name: /OpenAI/i });
    await waitFor(() => expect(openAiButton).toBeEnabled());

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
    await waitFor(() => expect(testBtn).toBeEnabled());
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Connection Successful')).toBeInTheDocument();
      expect(screen.getByText(/Connected to Ollama successfully/i)).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 12000);

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<AiSettingsModal isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Ollama/i })).toBeEnabled());

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a recoverable message when saved settings fail to load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Settings service is unavailable.' }),
    });

    render(<AiSettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Settings service is unavailable.');
    expect(screen.getByRole('button', { name: /dismiss error/i })).toBeInTheDocument();
  });
});
