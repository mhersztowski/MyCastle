// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import UsersPage from './UsersPage';

vi.mock('../../services/MinisApiService', () => ({
  minisApi: {
    getUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('@modules/auth', () => ({
  useAuth: vi.fn(() => ({
    currentUser: { id: 'a1', name: 'Admin', isAdmin: true, roles: [] },
    startImpersonating: vi.fn(),
  })),
}));

import { minisApi } from '../../services/MinisApiService';

const mockUsers = [
  { id: 'u1', name: 'Alice', isAdmin: true, roles: ['admin'] },
  { id: 'u2', name: 'Bob', isAdmin: false, roles: ['viewer'] },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

function renderPage() {
  return render(<UsersPage />, { wrapper });
}

beforeEach(() => {
  vi.mocked(minisApi.getUsers).mockReset();
  vi.mocked(minisApi.createUser).mockReset();
  vi.mocked(minisApi.updateUser).mockReset();
  vi.mocked(minisApi.deleteUser).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('UsersPage', () => {
  it('loads and displays users table', async () => {
    vi.mocked(minisApi.getUsers).mockResolvedValue(mockUsers as any);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows "No users" when list is empty', async () => {
    vi.mocked(minisApi.getUsers).mockResolvedValue([]);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('No users')).toBeInTheDocument();
  });

  it('shows error alert on API failure', async () => {
    vi.mocked(minisApi.getUsers).mockRejectedValue(new Error('Server error'));

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('Add User button opens dialog', async () => {
    vi.mocked(minisApi.getUsers).mockResolvedValue([]);
    const user = userEvent.setup();

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('No users')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add user/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('saves new user via add dialog', async () => {
    vi.mocked(minisApi.getUsers).mockResolvedValue([]);
    vi.mocked(minisApi.createUser).mockResolvedValue({ id: 'u3', name: 'Charlie', isAdmin: false, roles: [] } as any);

    const user = userEvent.setup();

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('No users')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add user/i }));

    const nameInput = screen.getByLabelText(/^name/i);
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(nameInput, 'Charlie');
    await user.type(passwordInput, 'secret');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(minisApi.createUser).toHaveBeenCalled();
    });
  });
});
