import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from '@components/Layout';
import FilesystemListPage from '@pages/filesystem/FilesystemListPage';
import FilesystemSavePage from '@pages/filesystem/FilesystemSavePage';
import MonacoEditorPage from '@pages/editor/MonacoEditorPage';
import HomePage from '@pages/HomePage';
import LoginPage from '@pages/LoginPage';
import { AdminDashboardPage, UsersPage, DevicesDefPage, ModulesDefPage, ProjectDefsPage } from '@pages/admin';
import { UserDashboardPage, UserDevicesPage, UserProjectsPage, ProjectPage } from '@pages/user';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login/:userId" element={<LoginPage />} />
      <Route path="/user/:userId/editor/monaco/*" element={<MonacoEditorPage />} />
      <Route path="/user/:userId/project" element={<ProjectPage />} />
      <Route
        path="*"
        element={
          <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Layout>
              <Routes>
                <Route path="/admin/:userId/main" element={<AdminDashboardPage />} />
                <Route path="/admin/:userId/users" element={<UsersPage />} />
                <Route path="/admin/:userId/devicesdefs" element={<DevicesDefPage />} />
                <Route path="/admin/:userId/modulesdefs" element={<ModulesDefPage />} />
                <Route path="/admin/:userId/projectdefs" element={<ProjectDefsPage />} />
                <Route path="/admin/:userId/filesystem/list" element={<FilesystemListPage />} />
                <Route path="/admin/:userId/filesystem/save" element={<FilesystemSavePage />} />
                <Route path="/user/:userId/main" element={<UserDashboardPage />} />
                <Route path="/user/:userId/devices" element={<UserDevicesPage />} />
                <Route path="/user/:userId/projects" element={<UserProjectsPage />} />
              </Routes>
            </Layout>
          </Box>
        }
      />
    </Routes>
  );
}

export default App;
