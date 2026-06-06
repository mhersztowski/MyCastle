// MUST be first — wires our bundled Monaco into @monaco-editor/loader before
// ANY other module in the import tree has a chance to call loader.init() and
// fall through to the CDN. See `monacoEarlyConfig.ts` for the full reasoning.
// This single import replaces what used to live inline in main.tsx (the
// `loader.config({ monaco })` + `loader.init()` calls); putting them in their
// own module is what gives them an early enough evaluation slot.
import './monacoEarlyConfig';

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
import { GlobalVfs } from './components/GlobalVfs';
import { GlobalDrive } from './components/GlobalDrive';
import { GlobalMemory } from './components/GlobalMemory';
import { GlobalEditor } from './components/GlobalEditor';
import { MinimizedTaskbar } from './components/MinimizedTaskbar';
import { PluginProvider } from './modules/web-plugins';
import { DisplayProvider } from './components/DisplayContext';
import { useEffect } from 'react';
import { useMqtt } from './modules/mqttclient';
import { presenceService } from './services/PresenceService';
import './global.css';
import '@mhersztowski/texteditor/dist/index.css';

App.create();

// Wraps MqttProvider passing JWT token as MQTT password and scoping file paths to the current user
function MqttProviderWithAuth({ children }: { children: React.ReactNode }) {
  const { token, currentUser } = useAuth();
  const userBasePath = currentUser ? `Minis/Users/${currentUser.name}` : '';
  return (
    <MqttProvider mqttUsername="web" mqttPassword={token ?? undefined} userBasePath={userBasePath}>
      {children}
    </MqttProvider>
  );
}

// Starts/stops PresenceService whenever auth+mqtt become available
function PresenceRunner() {
  const { currentUser } = useAuth();
  const { rawPublish, isConnected } = useMqtt();

  useEffect(() => {
    if (currentUser && isConnected) {
      presenceService.start(rawPublish, currentUser.name);
      return () => presenceService.stop();
    }
  }, [currentUser, isConnected, rawPublish]);

  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DisplayProvider>
      <BrowserRouter>
        <NotificationProvider>
          <AuthProvider>
            <PluginProvider>
            <MqttProviderWithAuth>
              <PresenceRunner />
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
                    <GlobalVfs />
                    <GlobalDrive />
                    <GlobalMemory />
                    <GlobalEditor />
                    <MinimizedTaskbar />
                  </GlobalWindowsProvider>
                </MinisDataSourceProvider>
              </FilesystemProvider>
            </MqttProviderWithAuth>
            </PluginProvider>
          </AuthProvider>
        </NotificationProvider>
      </BrowserRouter>
    </DisplayProvider>
  </React.StrictMode>
);

window.addEventListener('beforeunload', () => {
  App.instance.shutdown();
});
