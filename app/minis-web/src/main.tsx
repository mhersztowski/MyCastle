import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { MqttProvider } from '@modules/mqttclient';
import { FilesystemProvider } from '@modules/filesystem/FilesystemContext';
import { ProjectDefinitionsProvider } from '@modules/filesystem/ProjectDefinitionsContext';
import { ProjectRealizationsProvider } from '@modules/filesystem/ProjectRealizationsContext';
import App from './App';
import theme from './theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <MqttProvider>
          <FilesystemProvider>
            <ProjectDefinitionsProvider>
              <ProjectRealizationsProvider>
                <App />
              </ProjectRealizationsProvider>
            </ProjectDefinitionsProvider>
          </FilesystemProvider>
        </MqttProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
