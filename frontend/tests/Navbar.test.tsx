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

  it('renders branding title and connection state', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('PyDebug')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders active filename and function breadcrumbs', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('claim_coverage_tools.py')).toBeInTheDocument();
    expect(screen.getByText('check_policy_waiting_period()')).toBeInTheDocument();
  });

  it('renders AI Engine button and triggers onOpenAiSettings', () => {
    const onOpenAiSettings = vi.fn();
    render(<Navbar {...defaultProps} onOpenAiSettings={onOpenAiSettings} />);

    const aiButton = screen.getByTitle(/AI engine/i);
    fireEvent.click(aiButton);
    expect(onOpenAiSettings).toHaveBeenCalled();
  });

  it('calls onToggleTheme when theme toggle is clicked', () => {
    const onToggleTheme = vi.fn();
    render(<Navbar {...defaultProps} theme="dark" onToggleTheme={onToggleTheme} />);

    const themeBtn = screen.getByLabelText('Switch to light theme');
    fireEvent.click(themeBtn);
    expect(onToggleTheme).toHaveBeenCalled();
  });

  it('navigates to dashboard when clicking brand logo', () => {
    const onPageChange = vi.fn();
    render(<Navbar {...defaultProps} onPageChange={onPageChange} />);

    const brand = screen.getByText('PyDebug');
    fireEvent.click(brand);
    expect(onPageChange).toHaveBeenCalledWith('dashboard');
  });
});
