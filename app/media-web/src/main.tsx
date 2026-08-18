import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { App } from './App';
import { theme } from './theme';
import { PlayerProvider } from './modules/player/PlayerProvider';

/*
 * PlayerProvider stoi nad routerem, a nie pod nim.
 *
 * Element `<audio>` żyje w tym providerze; gdyby był niżej, zmiana strony
 * przemontowywałaby go razem z odtwarzanym dźwiękiem.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PlayerProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PlayerProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
