import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from './components/Layout';
import { MinimalTopBar } from './components/MinimalTopBar';

// Mycastle full-page routes (no layout)
import WorkspaceMdPage from './pages/workspace/WorkspaceMdPage';
import SimpleEditorPage from './pages/editor/SimpleEditorPage';
import MdEditorPage from './pages/editor/MdEditorPage';
import MdViewerPage from './pages/viewer/MdViewerPage';
import UIDesignerPage from './pages/designer/UIDesignerPage';
import AutomateDesignerPage from './pages/automate/AutomateDesignerPage';
import UIViewerPage from './pages/viewer/UIViewerPage';

// Minis full-page routes (no layout)
import LoginPage from './pages/LoginPage';
import MinisMonacoEditorPage from './pages/editor/MinisMonacoEditorPage';
import MinisProjectPage from './pages/minis-user/ProjectPage';
import MinisUPythonProjectPage from './pages/minis-user/UPythonProjectPage';

// Layout pages — Pim
import CalendarPage from './pages/calendar/CalendarPage';
import { ToDoListPage } from './pages/todolist';
import { ObjectViewerPage } from './pages/objectviewer';
import ComponentsPage from './pages/components/ComponentsPage';
import CastlePersonPage from './pages/person/PersonPage';
import CastleProjectPage from './pages/project/ProjectPage';
import AutomateListPage from './pages/automate/AutomateListPage';
import AiSettingsPage from './pages/settings/AiSettingsPage';
import SpeechSettingsPage from './pages/settings/SpeechSettingsPage';
import ReceiptSettingsPage from './pages/settings/ReceiptSettingsPage';
import PageHooksSettingsPage from './pages/settings/PageHooksSettingsPage';
import CastleAgentPage from './pages/agent/CastleAgentPage';
import ShoppingPage from './pages/shopping/ShoppingPage';

// Layout pages — minis
import HomePage from './pages/HomePage';
import { AdminDashboardPage, UsersPage, DevicesDefPage, ModulesDefPage, ProjectDefsPage } from './pages/admin';
import {
  UserDashboardPage,
  UserDevicesPage,
  UserProjectsPage,
  UserUPythonProjectsPage,
  IotDashboardPage,
  IotDevicesPage,
  IotDevicePage,
  IotAlertsPage,
  IotEmulatorPage,
  RpcExplorerPage,
  MqttExplorerPage,
  ApiKeysPage,
  TestVfsPage,
  DocsPage,
  LocalizationPage,
} from './pages/minis-user';

import { useAuth } from './modules/auth';
import { usePageHooks } from './modules/automate/hooks/usePageHooks';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, impersonating } = useAuth();
  const { userName } = useParams();
  if (!isAdmin || impersonating) return <Navigate to={`/user/${userName}/main`} replace />;
  return <>{children}</>;
}

const PageHooksRunner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  usePageHooks();
  return <>{children}</>;
};

function AppRoot() {
  return (
    <PageHooksRunner>
      <Routes>
        {/* Full-page routes without layout (mycastle) */}
        <Route path="/workspace/md/*" element={<RequireAuth><MinimalTopBar><WorkspaceMdPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/editor/simple/*" element={<RequireAuth><MinimalTopBar><SimpleEditorPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/editor/md/*" element={<RequireAuth><MinimalTopBar><MdEditorPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/viewer/md/*" element={<RequireAuth><MinimalTopBar><MdViewerPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/designer/ui/:id?" element={<RequireAuth><MinimalTopBar><UIDesignerPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/designer/automate/:id?" element={<RequireAuth><MinimalTopBar><AutomateDesignerPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/viewer/ui/:id" element={<RequireAuth><MinimalTopBar><UIViewerPage /></MinimalTopBar></RequireAuth>} />

        {/* Public full-page routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login/:userName" element={<LoginPage />} />
        <Route path="/user/:userName/editor/monaco/*" element={<RequireAuth><MinisMonacoEditorPage /></RequireAuth>} />
        <Route path="/user/:userName/project/:projectId" element={<RequireAuth><MinisProjectPage /></RequireAuth>} />
        <Route path="/user/:userName/upython-project/:projectId" element={<RequireAuth><MinisUPythonProjectPage /></RequireAuth>} />

        {/* All layout routes — single Layout handles nav based on path */}
        <Route
          path="*"
          element={
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Layout>
                <Routes>
                  {/* Minis admin */}
                  <Route path="/admin/:userName/main" element={<AdminDashboardPage />} />
                  <Route path="/admin/:userName/users" element={<UsersPage />} />
                  <Route path="/admin/:userName/devicesdefs" element={<DevicesDefPage />} />
                  <Route path="/admin/:userName/modulesdefs" element={<ModulesDefPage />} />
                  <Route path="/admin/:userName/projectdefs" element={<ProjectDefsPage />} />


                  {/* Minis user */}
                  <Route path="/user/:userName/main" element={<UserDashboardPage />} />
                  <Route path="/user/:userName/localization" element={<LocalizationPage />} />
                  <Route path="/user/:userName/electronics/devices" element={<UserDevicesPage />} />
                  <Route path="/user/:userName/electronics/arduino" element={<UserProjectsPage />} />
                  <Route path="/user/:userName/electronics/upython" element={<UserUPythonProjectsPage />} />
                  <Route path="/user/:userName/iot/dashboard" element={<IotDashboardPage />} />
                  <Route path="/user/:userName/iot/devices" element={<IotDevicesPage />} />
                  <Route path="/user/:userName/iot/device/:deviceName" element={<IotDevicePage />} />
                  <Route path="/user/:userName/iot/alerts" element={<IotAlertsPage />} />
                  <Route path="/user/:userName/iot/emulator" element={<IotEmulatorPage />} />
                  <Route path="/user/:userName/tools/rpc" element={<AdminOnly><RpcExplorerPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/mqtt-explorer" element={<AdminOnly><MqttExplorerPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/api-keys" element={<AdminOnly><ApiKeysPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/testvfs" element={<AdminOnly><TestVfsPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/docs" element={<AdminOnly><DocsPage /></AdminOnly>} />

                  {/* Pim pages under /user/:userName */}
                  <Route path="/user/:userName/pim/calendar" element={<CalendarPage />} />
                  <Route path="/user/:userName/pim/todolist" element={<ToDoListPage />} />
                  <Route path="/user/:userName/pim/person" element={<CastlePersonPage />} />
                  <Route path="/user/:userName/pim/project" element={<CastleProjectPage />} />
                  <Route path="/user/:userName/pim/shopping" element={<ShoppingPage />} />
                  <Route path="/user/:userName/pim/automate" element={<AutomateListPage />} />
                  <Route path="/user/:userName/pim/objectviewer" element={<ObjectViewerPage />} />
                  <Route path="/user/:userName/pim/components" element={<ComponentsPage />} />
                  <Route path="/user/:userName/pim/settings/ai" element={<AiSettingsPage />} />
                  <Route path="/user/:userName/pim/settings/speech" element={<SpeechSettingsPage />} />
                  <Route path="/user/:userName/pim/settings/receipt" element={<ReceiptSettingsPage />} />
                  <Route path="/user/:userName/pim/settings/page-hooks" element={<PageHooksSettingsPage />} />
                  <Route path="/user/:userName/pim/agent" element={<CastleAgentPage />} />
                </Routes>
              </Layout>
            </Box>
          }
        />
      </Routes>
    </PageHooksRunner>
  );
}

export default AppRoot;
