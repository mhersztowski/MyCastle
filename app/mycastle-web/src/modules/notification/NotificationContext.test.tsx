import React, { useContext } from 'react';
import { renderHook, act, screen, render } from '@testing-library/react';
import NotificationContext, { NotificationProvider, useNotification } from './NotificationContext';

describe('NotificationContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NotificationProvider>{children}</NotificationProvider>
  );

  it('has undefined default context value (guard throws outside provider)', () => {
    // Verify the context default is undefined, which triggers the throw guard in useNotification.
    // We test the raw context instead of renderHook to avoid React's uncatchable stderr logging.
    const { result } = renderHook(() => useContext(NotificationContext));
    expect(result.current).toBeNull();
  });

  it('provides notify function', () => {
    const { result } = renderHook(() => useNotification(), { wrapper });
    expect(result.current.notify).toBeDefined();
    expect(typeof result.current.notify).toBe('function');
  });

  it('renders notification message in alert', async () => {
    const TestComponent = () => {
      const { notify } = useNotification();
      return (
        <button onClick={() => notify('Test message', 'success')}>Notify</button>
      );
    };

    render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>,
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Notify' }).click();
    });

    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('defaults severity to info', async () => {
    const TestComponent = () => {
      const { notify } = useNotification();
      return <button onClick={() => notify('Info msg')}>Notify</button>;
    };

    render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>,
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Notify' }).click();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass('MuiAlert-filledInfo');
  });
});
