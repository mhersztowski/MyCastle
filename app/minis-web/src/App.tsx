import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from '@components/Layout';
import FilesystemListPage from '@pages/filesystem/FilesystemListPage';
import FilesystemSavePage from '@pages/filesystem/FilesystemSavePage';
import MonacoEditorPage from '@pages/editor/MonacoEditorPage';
import HomePage from '@pages/HomePage';
import LoginPage from '@pages/LoginPage';
import { AdminDashboardPage, UsersPage, DevicesDefPage, ModulesDefPage, ProjectDefsPage } from '@pages/admin';
import { UserDashboardPage, UserDevicesPage, UserProjectsPage, ProjectPage, IotDashboardPage, IotDevicesPage, IotDevicePage, IotAlertsPage, IotEmulatorPage, RpcExplorerPage, MqttExplorerPage, ApiKeysPage } from '@pages/user';
import { useAuth } from '@modules/auth';

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, impersonating } = useAuth();
  const { userName } = useParams();
  if (!isAdmin || impersonating) return <Navigate to={`/user/${userName}/main`} replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login/:userName" element={<LoginPage />} />
      <Route path="/user/:userName/editor/monaco/*" element={<MonacoEditorPage />} />
      <Route path="/user/:userName/project/:projectId" element={<ProjectPage />} />
      <Route
        path="*"
        element={
          <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Layout>
              <Routes>
                <Route path="/admin/:userName/main" element={<AdminDashboardPage />} />
                <Route path="/admin/:userName/users" element={<UsersPage />} />
                <Route path="/admin/:userName/devicesdefs" element={<DevicesDefPage />} />
                <Route path="/admin/:userName/modulesdefs" element={<ModulesDefPage />} />
                <Route path="/admin/:userName/projectdefs" element={<ProjectDefsPage />} />
                <Route path="/admin/:userName/filesystem/list" element={<FilesystemListPage />} />
                <Route path="/admin/:userName/filesystem/save" element={<FilesystemSavePage />} />
                <Route path="/user/:userName/main" element={<UserDashboardPage />} />
                <Route path="/user/:userName/electronics/devices" element={<UserDevicesPage />} />
                <Route path="/user/:userName/electronics/arduino" element={<UserProjectsPage />} />
                <Route path="/user/:userName/iot/dashboard" element={<IotDashboardPage />} />
                <Route path="/user/:userName/iot/devices" element={<IotDevicesPage />} />
                <Route path="/user/:userName/iot/device/:deviceName" element={<IotDevicePage />} />
                <Route path="/user/:userName/iot/alerts" element={<IotAlertsPage />} />
                <Route path="/user/:userName/iot/emulator" element={<IotEmulatorPage />} />
                <Route path="/user/:userName/tools/rpc" element={<AdminOnly><RpcExplorerPage /></AdminOnly>} />
                <Route path="/user/:userName/tools/mqtt-explorer" element={<AdminOnly><MqttExplorerPage /></AdminOnly>} />
                <Route path="/user/:userName/tools/api-keys" element={<AdminOnly><ApiKeysPage /></AdminOnly>} />
              </Routes>
            </Layout>
          </Box>
        }
      />
    </Routes>
  );
}

export default App;
