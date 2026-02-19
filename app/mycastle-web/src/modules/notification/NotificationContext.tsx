/**
 * NotificationContext - globalny system powiadomień (Snackbar)
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Snackbar, Alert } from '@mui/material';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: number;
  message: string;
  severity: NotificationSeverity;
}

interface NotificationContextType {
  notify: (message: string, severity?: NotificationSeverity) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

let notificationId = 0;

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [queue, setQueue] = useState<Notification[]>([]);
  const [current, setCurrent] = useState<Notification | null>(null);
  const [open, setOpen] = useState(false);

  const notify = useCallback((message: string, severity: NotificationSeverity = 'info') => {
    const notification: Notification = {
      id: ++notificationId,
      message,
      severity,
    };
    setQueue(prev => [...prev, notification]);
  }, []);

  // Show next notification from queue
  useEffect(() => {
    if (!open && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      setOpen(true);
    }
  }, [open, queue]);

  const handleClose = useCallback((_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ zIndex: 9999 }}
      >
        <Alert
          onClose={handleClose}
          severity={current?.severity || 'info'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

export default NotificationContext;
