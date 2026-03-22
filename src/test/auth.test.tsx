import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import AuthPage from '@/pages/AuthPage';

// --- Mock the fetch API so the test doesn't need a real backend ---
const mockUser = {
  id: 'test-id-123',
  username: 'johnny',
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  birthday: '2000-01-01',
  avatar: null,
  country: 'Afghanistan',
  countryCode: 'AF',
  isOnline: true,
  stats: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
  preferences: { boardTheme: 'classic', checkerColor: 'white', soundEnabled: true, animationsEnabled: true },
};

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (String(url).includes('/auth/register')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: 'mock-jwt-token', user: mockUser }),
    });
  }
  if (String(url).includes('/auth/me')) {
    // No stored token at start – return 401 so loading clears quickly
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}) as typeof fetch;

describe('registration flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('creates an account and redirects to the dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthPage />} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for the loading state to resolve (AuthProvider calls /auth/me on mount)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Register' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'johnny' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Birthday'), { target: { value: '2000-01-01' } });

    fireEvent.click(screen.getByText('Select country'));
    fireEvent.click(screen.getByRole('button', { name: /Afghanistan/i }));

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // JWT should have been stored
    expect(localStorage.getItem('checkers_token')).toBe('mock-jwt-token');
  });
});
