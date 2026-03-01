import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { MqttProvider } from '@modules/mqttclient';
import { FilesystemProvider } from '@modules/filesystem/FilesystemContext';
import { MinisDataSourceProvider } from '@modules/filesystem/MinisDataSourceContext';
import { AuthProvider } from '@modules/auth';
import { GlobalWindowsProvider } from './components/GlobalWindowsContext';
import { GlobalApiDocs } from './components/GlobalApiDocs';
import { GlobalRpcExplorer } from './components/GlobalRpcExplorer';
import { GlobalMqttExplorer } from './components/GlobalMqttExplorer';
import App from './App';
import theme from './theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <MqttProvider>
          <FilesystemProvider>
            <MinisDataSourceProvider>
              <AuthProvider>
                <GlobalWindowsProvider>
                  <App />
                  <GlobalApiDocs />
                  <GlobalRpcExplorer />
                  <GlobalMqttExplorer />
                </GlobalWindowsProvider>
              </AuthProvider>
            </MinisDataSourceProvider>
          </FilesystemProvider>
        </MqttProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
