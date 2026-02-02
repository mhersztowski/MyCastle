import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import FileSavePage from './pages/filesystem/FileSavePage';
import FileListPage from './pages/filesystem/FileListPage';
import SimpleEditorPage from './pages/editor/SimpleEditorPage';
import MdViewerPage from './pages/viewer/MdViewerPage';
import { MqttProvider } from './modules/mqttclient/MqttContext';

function App() {
  return (
    <MqttProvider>
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
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </MqttProvider>
  );
}

export default App;
