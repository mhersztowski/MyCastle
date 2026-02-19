import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import FileListPage from './pages/filesystem/FileListPage';
import CalendarPage from './pages/calendar/CalendarPage';
import { ToDoListPage } from './pages/todolist';
import { ObjectViewerPage } from './pages/objectviewer';
import ComponentsPage from './pages/components/ComponentsPage';
import SimpleEditorPage from './pages/editor/SimpleEditorPage';
import MdEditorPage from './pages/editor/MdEditorPage';
import MdViewerPage from './pages/viewer/MdViewerPage';
import UIDesignerPage from './pages/designer/UIDesignerPage';
import UIViewerPage from './pages/viewer/UIViewerPage';
import PersonPage from './pages/person/PersonPage';
import ProjectPage from './pages/project/ProjectPage';
import AutomateDesignerPage from './pages/automate/AutomateDesignerPage';
import AutomateListPage from './pages/automate/AutomateListPage';
import AiSettingsPage from './pages/settings/AiSettingsPage';
import SpeechSettingsPage from './pages/settings/SpeechSettingsPage';
import ReceiptSettingsPage from './pages/settings/ReceiptSettingsPage';
import PageHooksSettingsPage from './pages/settings/PageHooksSettingsPage';
import CastleAgentPage from './pages/agent/CastleAgentPage';
import ShoppingPage from './pages/shopping/ShoppingPage';
import { MqttProvider } from './modules/mqttclient/MqttContext';
import { FilesystemProvider } from './modules/filesystem/FilesystemContext';
import { NotificationProvider } from './modules/notification';
import { usePageHooks } from './modules/automate/hooks/usePageHooks';

// Component that uses page hooks
const PageHooksRunner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  usePageHooks();
  return <>{children}</>;
};

function App() {
  return (
    <NotificationProvider>
      <MqttProvider>
        <FilesystemProvider>
          <PageHooksRunner>
          <Routes>
            <Route path="/editor/simple/*" element={<SimpleEditorPage />} />
            <Route path="/editor/md/*" element={<MdEditorPage />} />
            <Route path="/viewer/md/*" element={<MdViewerPage />} />
            <Route path="/designer/ui/:id?" element={<UIDesignerPage />} />
            <Route path="/designer/automate/:id?" element={<AutomateDesignerPage />} />
            <Route path="/viewer/ui/:id" element={<UIViewerPage />} />
            <Route
              path="*"
              element={
                <Layout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/filesystem/list" replace />} />
                    <Route path="/filesystem/list" element={<FileListPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/todolist" element={<ToDoListPage />} />
                    <Route path="/person" element={<PersonPage />} />
                    <Route path="/project" element={<ProjectPage />} />
                    <Route path="/shopping" element={<ShoppingPage />} />
                    <Route path="/automate" element={<AutomateListPage />} />
                    <Route path="/objectviewer" element={<ObjectViewerPage />} />
                    <Route path="/components" element={<ComponentsPage />} />
                    <Route path="/settings/ai" element={<AiSettingsPage />} />
                    <Route path="/settings/speech" element={<SpeechSettingsPage />} />
                    <Route path="/settings/receipt" element={<ReceiptSettingsPage />} />
                    <Route path="/settings/page-hooks" element={<PageHooksSettingsPage />} />
                    <Route path="/agent" element={<CastleAgentPage />} />
                  </Routes>
                </Layout>
              }
            />
          </Routes>
          </PageHooksRunner>
        </FilesystemProvider>
      </MqttProvider>
    </NotificationProvider>
  );
}

export default App;
