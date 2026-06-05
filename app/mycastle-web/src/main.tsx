import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Configure @monaco-editor/react to use the bundled Monaco instead of loading from CDN.
// Without this, @monaco-editor/react fetches Monaco 0.55.x from cdn.jsdelivr.net, which:
//  - Creates a second Monaco runtime alongside our bundled 0.52.x
//  - Overwrites window.MonacoEnvironment with CDN worker URLs
//  - Causes the bundled JSON worker to never receive languageSettings → "Cannot read
//    properties of undefined (reading 'schemas')" crash in json.worker.js
import { loader } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor';
loader.config({ monaco: monacoEditor });
// Force early initialization so isInitialized=true is set with OUR Monaco before any
// component's useEffect can race and trigger CDN loading (loader.init() marks the loader
// as initialized on first call; subsequent calls from Editor components just resolve the
// already-resolved wrapperPromise instead of falling through to CDN script injection).
void loader.init();
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
