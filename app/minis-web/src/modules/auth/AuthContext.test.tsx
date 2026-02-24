// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import type { ReactNode } from 'react';

vi.mock('../../services/MinisApiService', () => ({
  minisApi: {
    login: vi.fn(),
  },
}));

import { minisApi } from '../../services/MinisApiService';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  vi.mocked(minisApi.login).mockReset();
  sessionStorage.clear();
});

describe('AuthContext', () => {
  describe('initial state', () => {
    it('currentUser is null', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.currentUser).toBeNull();
      expect(result.current.isAdmin).toBe(false);
    });

    it('restores from sessionStorage', () => {
      const user = { id: 'u1', name: 'Alice', isAdmin: true, roles: [] };
      sessionStorage.setItem('minis_current_user', JSON.stringify(user));

      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.currentUser).toEqual(user);
      expect(result.current.isAdmin).toBe(true);
    });
  });

  describe('login', () => {
    it('sets currentUser and stores in sessionStorage', async () => {
      const user = { type: 'user' as const, id: 'u1', name: 'Alice', isAdmin: false, roles: ['viewer'] };
      vi.mocked(minisApi.login).mockResolvedValueOnce(user);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('u1', 'pass');
      });

      expect(result.current.currentUser).toEqual(user);
      expect(result.current.isAdmin).toBe(false);
      expect(JSON.parse(sessionStorage.getItem('minis_current_user')!)).toEqual(user);
    });

    it('admin user sets isAdmin to true', async () => {
      const user = { type: 'user' as const, id: 'admin1', name: 'Admin', isAdmin: true, roles: ['admin'] };
      vi.mocked(minisApi.login).mockResolvedValueOnce(user);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('admin1', 'pass');
      });

      expect(result.current.isAdmin).toBe(true);
    });

    it('propagates error from minisApi', async () => {
      vi.mocked(minisApi.login).mockRejectedValueOnce(new Error('Invalid credentials'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await expect(
        act(async () => {
          await result.current.login('u1', 'wrong');
        })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('clears currentUser and sessionStorage', async () => {
      const user = { type: 'user' as const, id: 'u1', name: 'Alice', isAdmin: false, roles: [] as string[] };
      vi.mocked(minisApi.login).mockResolvedValueOnce(user);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('u1', 'pass');
      });
      expect(result.current.currentUser).toBeTruthy();

      act(() => {
        result.current.logout();
      });

      expect(result.current.currentUser).toBeNull();
      expect(result.current.isAdmin).toBe(false);
      expect(sessionStorage.getItem('minis_current_user')).toBeNull();
    });
  });

  describe('useAuth outside provider', () => {
    it('throws error', () => {
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');
    });
  });
});
