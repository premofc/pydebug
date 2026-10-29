import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../src/components/Navbar';
import type { PageId } from '../types';

describe('Navbar Component', () => {
  const defaultProps = {
    currentPage: 'dashboard' as PageId,
    onPageChange: vi.fn(),
    isConnected: true,
    sessionId: 'sess_abc12345',
    activeFileName: 'claim_coverage_tools.py',
    activeFunctionName: 'check_policy_waiting_period',
    theme: 'dark' as 'dark' | 'light',
    onToggleTheme: vi.fn(),
    onOpenAiSettings: vi.fn(),
    aiConfig: {
      provider: 'ollama' as const,
      model: 'qwen2.5:7b-instruct',
      base_url: 'http://127.0.0.1:11434',
      temperature: 0.2,
      has_api_key: false,
      api_key_masked: '',
    },
    stats: {
      total_events: 120,
      duration_ms: 45.6,
      max_depth: 1,
    },
  };

  it('renders branding title and version badge', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('PyDebug')).toBeInTheDocument();
    expect(screen.getByText('v0.1.3')).toBeInTheDocument();
  });

  it('renders live stream badge when isConnected is true', () => {
    render(<Navbar {...defaultProps} isConnected={true} />);
    expect(screen.getByText('Live Stream')).toBeInTheDocument();
    expect(screen.getByText('#sess_a')).toBeInTheDocument();
  });

  it('renders snapshot badge when isConnected is false', () => {
    render(<Navbar {...defaultProps} isConnected={false} sessionId={undefined} />);
    expect(screen.getByText('Snapshot')).toBeInTheDocument();
    expect(screen.getByText('#ready')).toBeInTheDocument();
  });

  it('renders active filename and function breadcrumbs', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('claim_coverage_tools.py')).toBeInTheDocument();
    expect(screen.getByText('check_policy_waiting_period()')).toBeInTheDocument();
  });

  it('falls back to workspace ready text when filename is demo or missing', () => {
    render(
      <Navbar
        {...defaultProps}
        activeFileName="demo_algorithms.py"
        activeFunctionName="compute_risk_score"
      />
    );
    expect(screen.getByText('ClaimCare MCP Workspace')).toBeInTheDocument();
    expect(screen.getByText('• Ready')).toBeInTheDocument();
  });

  it('calls onPageChange when navigation pills are clicked', () => {
    const onPageChange = vi.fn();
    render(<Navbar {...defaultProps} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByText('Hunter'));
    expect(onPageChange).toHaveBeenCalledWith('hunter');

    fireEvent.click(screen.getByText('Playground'));
    expect(onPageChange).toHaveBeenCalledWith('playground');

    fireEvent.click(screen.getByText('Birdseye'));
    expect(onPageChange).toHaveBeenCalledWith('birdseye');
  });

  it('calls onOpenAiSettings when AI pill is clicked', () => {
    const onOpenAiSettings = vi.fn();
    render(<Navbar {...defaultProps} onOpenAiSettings={onOpenAiSettings} />);

    const aiButton = screen.getByRole('button', { name: /ollama/i });
    fireEvent.click(aiButton);
    expect(onOpenAiSettings).toHaveBeenCalled();
  });

  it('calls onToggleTheme when theme toggle is clicked', () => {
    const onToggleTheme = vi.fn();
    render(<Navbar {...defaultProps} theme="dark" onToggleTheme={onToggleTheme} />);

    const themeBtn = screen.getByLabelText(/toggle theme/i);
    fireEvent.click(themeBtn);
    expect(onToggleTheme).toHaveBeenCalled();
  });

  it('displays real-time total events and duration metrics', () => {
    render(<Navbar {...defaultProps} stats={{ total_events: 950, duration_ms: 128.4, max_depth: 3 }} />);
    expect(screen.getByText('950')).toBeInTheDocument();
    expect(screen.getByText('128.4')).toBeInTheDocument();
  });
});
