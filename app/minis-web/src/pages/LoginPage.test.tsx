// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ userId: 'testuser' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../modules/auth', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogin.mockReset();
});

describe('LoginPage', () => {
  it('renders password field and login button', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('shows userId', () => {
    render(<LoginPage />);
    expect(screen.getByText(/testuser/i)).toBeInTheDocument();
  });

  it('login button disabled when password is empty', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
  });

  it('typing password enables login button', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText(/password/i), 'mypassword');
    expect(screen.getByRole('button', { name: /login/i })).toBeEnabled();
  });

  it('admin user navigates to admin page', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ id: 'testuser', name: 'Test', isAdmin: true, roles: [] });

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/testuser/main');
    });
  });

  it('non-admin user navigates to user page', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ id: 'testuser', name: 'Test', isAdmin: false, roles: [] });

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/user/testuser/main');
    });
  });

  it('shows error on login failure', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('back button navigates to /', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
