import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MqttProvider } from '@modules/mqttclient';
import { FilesystemProvider } from '@modules/filesystem/FilesystemContext';
import { MinisDataSourceProvider } from '@modules/filesystem/MinisDataSourceContext';
import { AuthProvider } from '@modules/auth';
import { GlobalWindowsProvider } from './components/GlobalWindowsContext';
import { GlobalApiDocs } from './components/GlobalApiDocs';
import { GlobalRpcExplorer } from './components/GlobalRpcExplorer';
import { GlobalMqttExplorer } from './components/GlobalMqttExplorer';
import { GlobalMjdDefEditor } from './components/GlobalMjdDefEditor';
import { GlobalMjdDataEditor } from './components/GlobalMjdDataEditor';
import { GlobalTerminal } from './components/GlobalTerminal';
import { DisplayProvider } from './components/DisplayContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DisplayProvider>
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
                  <GlobalMjdDefEditor />
                  <GlobalMjdDataEditor />
                  <GlobalTerminal />
                </GlobalWindowsProvider>
              </AuthProvider>
            </MinisDataSourceProvider>
          </FilesystemProvider>
        </MqttProvider>
      </BrowserRouter>
    </DisplayProvider>
  </React.StrictMode>
);
