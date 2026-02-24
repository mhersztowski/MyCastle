import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from '@components/Layout';
import FilesystemListPage from '@pages/filesystem/FilesystemListPage';
import FilesystemSavePage from '@pages/filesystem/FilesystemSavePage';
import MonacoEditorPage from '@pages/editor/MonacoEditorPage';
import HomePage from '@pages/HomePage';
import { AdminDashboardPage, ProjectDefinitionListPage, ProjectDefinitionFormPage } from '@pages/admin';
import { UserDashboardPage, ProjectRealizationPage, UserProjectsPage, ProjectPage } from '@pages/user';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/user/editor/monaco/*"
        element={<MonacoEditorPage />}
      />
      <Route
        path="/user/project"
        element={<ProjectPage />}
      />
      <Route
        path="*"
        element={
          <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Layout>
              <Routes>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/filesystem/list" element={<FilesystemListPage />} />
                <Route path="/admin/filesystem/save" element={<FilesystemSavePage />} />
                <Route path="/admin/projects" element={<ProjectDefinitionListPage />} />
                <Route path="/admin/projects/new" element={<ProjectDefinitionFormPage />} />
                <Route path="/admin/projects/:id" element={<ProjectDefinitionFormPage />} />
                <Route path="/user" element={<UserDashboardPage />} />
                <Route path="/user/projects" element={<UserProjectsPage />} />
                <Route path="/user/projects/:id" element={<ProjectRealizationPage />} />
              </Routes>
            </Layout>
          </Box>
        }
      />
    </Routes>
  );
}

export default App;
