import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import FileSavePage from './pages/filesystem/FileSavePage';
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
import { MqttProvider } from './modules/mqttclient/MqttContext';
import { FilesystemProvider } from './modules/filesystem/FilesystemContext';

function App() {
  return (
    <MqttProvider>
      <FilesystemProvider>
        <Routes>
        <Route path="/editor/simple/*" element={<SimpleEditorPage />} />
        <Route path="/editor/md/*" element={<MdEditorPage />} />
        <Route path="/viewer/md/*" element={<MdViewerPage />} />
        <Route path="/designer/ui/:id?" element={<UIDesignerPage />} />
        <Route path="/viewer/ui/:id" element={<UIViewerPage />} />
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/filesystem/list" replace />} />
                <Route path="/filesystem/save" element={<FileSavePage />} />
                <Route path="/filesystem/list" element={<FileListPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/todolist" element={<ToDoListPage />} />
                <Route path="/objectviewer" element={<ObjectViewerPage />} />
                <Route path="/components" element={<ComponentsPage />} />
              </Routes>
            </Layout>
          }
        />
        </Routes>
      </FilesystemProvider>
    </MqttProvider>
  );
}

export default App;
