import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { App } from './App';
import AppRoot from './AppRoot';
import theme from './theme';
import './global.css';

App.create();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppRoot />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

window.addEventListener('beforeunload', () => {
  App.instance.shutdown();
});
