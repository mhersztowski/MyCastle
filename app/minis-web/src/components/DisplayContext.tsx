import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';

export type ThemeMode = 'light' | 'dark';
export type DisplaySize = 'small' | 'medium' | 'large';

interface DisplayContextValue {
  themeMode: ThemeMode;
  size: DisplaySize;
  setThemeMode: (mode: ThemeMode) => void;
  setSize: (size: DisplaySize) => void;
}

const DisplayContext = createContext<DisplayContextValue>({
  themeMode: 'light',
  size: 'medium',
  setThemeMode: () => {},
  setSize: () => {},
});

const STORAGE_KEY = 'minis-display';

function loadSettings(): { themeMode: ThemeMode; size: DisplaySize } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { themeMode: 'light', size: 'medium' };
}

function saveSettings(themeMode: ThemeMode, size: DisplaySize) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ themeMode, size }));
}

const fontSizeMap: Record<DisplaySize, number> = { small: 12, medium: 14, large: 16 };

export function DisplayProvider({ children }: { children: ReactNode }) {
  const initial = loadSettings();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(initial.themeMode);
  const [size, setSizeState] = useState<DisplaySize>(initial.size);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      primary: { main: '#1976d2' },
      secondary: { main: '#424242' },
      ...(themeMode === 'light'
        ? { background: { default: '#fafafa', paper: '#ffffff' } }
        : {}),
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      fontSize: fontSizeMap[size],
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { margin: 0, padding: 0 } },
      },
    },
  }), [themeMode, size]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    saveSettings(mode, size);
  };

  const setSize = (s: DisplaySize) => {
    setSizeState(s);
    saveSettings(themeMode, s);
  };

  return (
    <DisplayContext.Provider value={{ themeMode, size, setThemeMode, setSize }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </DisplayContext.Provider>
  );
}

export function useDisplay() {
  return useContext(DisplayContext);
}
