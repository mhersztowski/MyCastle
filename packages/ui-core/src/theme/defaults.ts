import type { ThemeConfig } from '../types';

export const defaultTheme: ThemeConfig = {
  colors: {
    primary: '#4fc3f7',
    primaryVariant: '#039be5',
    secondary: '#80cbc4',
    secondaryVariant: '#4db6ac',
    background: '#1a1a1a',
    surface: '#252526',
    error: '#ef5350',
    onPrimary: '#000000',
    onSecondary: '#000000',
    onBackground: '#cccccc',
    onSurface: '#cccccc',
    onError: '#ffffff',
    border: '#404040',
    divider: '#333333',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  typography: {
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    fontSize: {
      xs: '0.6875rem',
      sm: '0.75rem',
      md: '0.8125rem',
      lg: '1rem',
      xl: '1.25rem',
      xxl: '1.5rem',
    },
    fontWeight: {
      light: 300,
      regular: 400,
      medium: 500,
      bold: 600,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.4,
      relaxed: 1.6,
    },
  },
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.4)',
    md: '0 3px 8px rgba(0,0,0,0.5)',
    lg: '0 8px 24px rgba(0,0,0,0.6)',
  },
  borderRadius: {
    sm: '3px',
    md: '6px',
    lg: '12px',
    full: '9999px',
  },
};
