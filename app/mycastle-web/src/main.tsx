import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import AppRoot from './AppRoot';
import { MqttProvider } from './modules/mqttclient/MqttContext';
import { FilesystemProvider } from './modules/filesystem/FilesystemContext';
import { NotificationProvider } from './modules/notification';
import { MinisDataSourceProvider } from './modules/minis-filesystem/MinisDataSourceContext';
import { AuthProvider, useAuth } from './modules/auth';
import { GlobalWindowsProvider } from './components/GlobalWindowsContext';
import { GlobalApiDocs } from './components/GlobalApiDocs';
import { GlobalRpcExplorer } from './components/GlobalRpcExplorer';
import { GlobalMqttExplorer } from './components/GlobalMqttExplorer';
import { GlobalMjdDefEditor } from './components/GlobalMjdDefEditor';
import { GlobalMjdDataEditor } from './components/GlobalMjdDataEditor';
import { GlobalTerminal } from './components/GlobalTerminal';
import { DisplayProvider } from './components/DisplayContext';
import './global.css';

App.create();

// Wraps MqttProvider passing the JWT token as MQTT password so the backend can auth
function MqttProviderWithAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return (
    <MqttProvider mqttUsername="web" mqttPassword={token ?? undefined}>
      {children}
    </MqttProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DisplayProvider>
      <BrowserRouter>
        <NotificationProvider>
          <AuthProvider>
            <MqttProviderWithAuth>
              <FilesystemProvider>
                <MinisDataSourceProvider>
                  <GlobalWindowsProvider>
                    <AppRoot />
                    <GlobalApiDocs />
                    <GlobalRpcExplorer />
                    <GlobalMqttExplorer />
                    <GlobalMjdDefEditor />
                    <GlobalMjdDataEditor />
                    <GlobalTerminal />
                  </GlobalWindowsProvider>
                </MinisDataSourceProvider>
              </FilesystemProvider>
            </MqttProviderWithAuth>
          </AuthProvider>
        </NotificationProvider>
      </BrowserRouter>
    </DisplayProvider>
  </React.StrictMode>
);

window.addEventListener('beforeunload', () => {
  App.instance.shutdown();
});
