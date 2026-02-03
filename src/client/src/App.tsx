import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import FileSavePage from './pages/filesystem/FileSavePage';
import FileListPage from './pages/filesystem/FileListPage';
import CalendarPage from './pages/calendar/CalendarPage';
import { ToDoListPage } from './pages/todolist';
import ComponentsPage from './pages/components/ComponentsPage';
import SimpleEditorPage from './pages/editor/SimpleEditorPage';
import MdViewerPage from './pages/viewer/MdViewerPage';
import { MqttProvider } from './modules/mqttclient/MqttContext';
import { FilesystemProvider } from './modules/filesystem/FilesystemContext';

function App() {
  return (
    <MqttProvider>
      <FilesystemProvider>
        <Routes>
        <Route path="/editor/simple/*" element={<SimpleEditorPage />} />
        <Route path="/viewer/md/*" element={<MdViewerPage />} />
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
