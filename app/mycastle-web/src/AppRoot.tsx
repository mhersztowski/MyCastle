import React, { lazy, Suspense, type ErrorInfo } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';

class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EditorErrorBoundary] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '32px 24px', fontFamily: 'monospace', background: '#1e1e1e',
          color: '#f48771', height: '100%', overflow: 'auto',
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Editor failed to load</div>
          <pre style={{ fontSize: 12, color: '#ce9178', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 24 }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 16px', background: '#007acc', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MdFileRedirect() {
  const location = useLocation();
  if (location.pathname.endsWith('.md')) {
    const path = location.pathname.startsWith('/') ? location.pathname.substring(1) : location.pathname;
    return <Navigate to={`/workspace/md/${path}`} replace />;
  }
  return null;
}
import { Box } from '@mui/material';
import Layout from './components/Layout';
import { MinimalTopBar } from './components/MinimalTopBar';

// Mycastle full-page routes (no layout)
import WorkspaceMdPage from './pages/workspace/WorkspaceMdPage';
import SimpleEditorPage from './pages/editor/SimpleEditorPage';
import MdEditorPage from './pages/editor/MdEditorPage';
import MdViewerPage from './pages/viewer/MdViewerPage';
import RichMdViewerPage from './pages/viewer/RichMdViewerPage';
import SharedMdViewerPage from './pages/viewer/SharedMdViewerPage';
import UIDesignerPage from './pages/designer/UIDesignerPage';
import FormEngineDesignerPage from './pages/designer/FormEngineDesignerPage';
import AutomateDesignerPage from './pages/automate/AutomateDesignerPage';
import UIViewerPage from './pages/viewer/UIViewerPage';

// Minis full-page routes (no layout)
import LoginPage from './pages/LoginPage';
import WatchPage from './pages/WatchPage';
const MinisMonacoEditorPage = lazy(() => import('./pages/editor/MinisMonacoEditorPage'));
// Baza wiedzy — katalog i tryb czytania nad katalogiem `knowledge/` w Drive.
const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage'));
// Heavy pages: Blockly + Monaco are large bundles — lazy load to keep initial bundle small (iOS Safari)
const MinisProjectPage = lazy(() => import('./pages/minis-user/ProjectPage'));
const MinisUPythonProjectPage = lazy(() => import('./pages/minis-user/UPythonProjectPage'));
const MinisPygameProjectPage = lazy(() => import('./pages/minis-user/PygameProjectPage'));
const MinisPicoSdkProjectPage = lazy(() => import('./pages/minis-user/PicoSdkProjectPage'));
const MinisCppProjectPage = lazy(() => import('./pages/minis-user/CppProjectPage'));
// Programming — UML editor (ReactFlow bundle is heavy → lazy load)
const UmlEditorPage = lazy(() => import('./pages/programming/UmlEditorPage'));
const MiniscPage = lazy(() => import('./pages/programming/MiniscPage'));
const LitComponentsPage = lazy(() => import('./pages/programming/ComponentsPage'));
const ServerLogicPage = lazy(() => import('./pages/programming/ServerLogicPage'));

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
import HealthPage from './pages/health/HealthPage';
import MemoryPage from './pages/memory/MemoryPage';
import DrivePage from './pages/drive/DrivePage';
import VncPage from './pages/vnc/VncPage';
import PulpitPage from './pages/pulpit/PulpitPage';

// Layout pages — minis
import HomePage from './pages/HomePage';
import { AdminDashboardPage, UsersPage, ScriptsPage, GithubProjectDefsPage, AppSessionsPage } from './pages/admin';
import {
  UserDashboardPage,
  UserDevicesPage,
  UserProjectsPage,
  UserUPythonProjectsPage,
  UserPygameProjectsPage,
  UserPicoSdkProjectsPage,
  UserCppProjectsPage,
  IotDashboardPage,
  IotDashboard2Page,
  IotDashboard2ConfigPage,
  IotDevicesPage,
  IotDevicePage,
  SmartDisplayPage,
  VirtualDisplayPage,
  IotAlertsPage,
  IotNotificationsPage,
  IotAutomationsPage,
  IotRetentionPage,
  IotEmulatorPage,
  IotAuraPage,
  IotAuraConversationEditorPage,
  ElectronicsConfigurationPage,
  ElectronicsWelcomePage,
  RpcExplorerPage,
  MqttExplorerPage,
  ApiKeysPage,
  TestVfsPage,
  DocsPage,
  UiDocsPage,
  LocalizationPage,
  DevicesDefPage,
} from './pages/minis-user';

import { useAuth } from './modules/auth';
import { usePageHooks } from './modules/automate/hooks/usePageHooks';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  if (!currentUser) {
    if (location.pathname !== '/') {
      sessionStorage.setItem('auth_redirect', location.pathname + location.search);
    }
    return <Navigate to="/" replace />;
  }
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
        {/* Baza wiedzy: `/knowledge` to katalog, `/knowledge/{ścieżka}` — dokument.
            Tryb czytania celowo bez chrome edytora, jak w raporcie (Etap 3). */}
        <Route path="/knowledge/*" element={<RequireAuth><MinimalTopBar><EditorErrorBoundary><Suspense fallback={null}><KnowledgePage /></Suspense></EditorErrorBoundary></MinimalTopBar></RequireAuth>} />
        <Route path="/workspace/md/*" element={<RequireAuth><MinimalTopBar><EditorErrorBoundary><WorkspaceMdPage /></EditorErrorBoundary></MinimalTopBar></RequireAuth>} />
        <Route path="/editor/simple/*" element={<RequireAuth><MinimalTopBar><SimpleEditorPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/editor/md/*" element={<RequireAuth><MinimalTopBar><EditorErrorBoundary><MdEditorPage /></EditorErrorBoundary></MinimalTopBar></RequireAuth>} />
        <Route path="/viewer/md/u/:userName/*" element={<RequireAuth><MinimalTopBar><EditorErrorBoundary><SharedMdViewerPage /></EditorErrorBoundary></MinimalTopBar></RequireAuth>} />
        <Route path="/viewer/md-rich/u/:userName/*" element={<MinimalTopBar><EditorErrorBoundary><RichMdViewerPage /></EditorErrorBoundary></MinimalTopBar>} />
        <Route path="/viewer/md/*" element={<RequireAuth><MinimalTopBar><EditorErrorBoundary><MdViewerPage /></EditorErrorBoundary></MinimalTopBar></RequireAuth>} />
        <Route path="/designer/ui/:id?" element={<RequireAuth><MinimalTopBar><UIDesignerPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/designer/automate/:id?" element={<RequireAuth><MinimalTopBar><AutomateDesignerPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/designer/form/*" element={<RequireAuth><MinimalTopBar><FormEngineDesignerPage /></MinimalTopBar></RequireAuth>} />
        <Route path="/viewer/ui/:id" element={<RequireAuth><MinimalTopBar><UIViewerPage /></MinimalTopBar></RequireAuth>} />

        {/* Public full-page routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/watch" element={<WatchPage />} />
        <Route path="/login/:userName" element={<LoginPage />} />
        <Route path="/user/:userName/editor/monaco/*" element={<RequireAuth><Suspense fallback={null}><MinisMonacoEditorPage /></Suspense></RequireAuth>} />
        <Route path="/user/:userName/project/:projectId" element={<RequireAuth><Suspense fallback={null}><MinisProjectPage key="blockly" /></Suspense></RequireAuth>} />
        <Route path="/user/:userName/project/:projectId/code" element={<RequireAuth><Suspense fallback={null}><MinisProjectPage key="code" mode="code" /></Suspense></RequireAuth>} />
        <Route path="/user/:userName/upython-project/:projectId" element={<RequireAuth><Suspense fallback={null}><MinisUPythonProjectPage /></Suspense></RequireAuth>} />
        <Route path="/user/:userName/pygame-project/:projectId" element={<RequireAuth><Suspense fallback={null}><MinisPygameProjectPage /></Suspense></RequireAuth>} />
        <Route path="/user/:userName/picosdk-project/:projectId" element={<RequireAuth><Suspense fallback={null}><MinisPicoSdkProjectPage /></Suspense></RequireAuth>} />
        <Route path="/user/:userName/cpp-project/:projectId" element={<RequireAuth><Suspense fallback={null}><MinisCppProjectPage /></Suspense></RequireAuth>} />

        {/* Full-bleed layout routes */}
        <Route
          path="/user/:userName/electronics/configuration"
          element={
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Layout fullBleed>
                <ElectronicsConfigurationPage />
              </Layout>
            </Box>
          }
        />
        <Route
          path="/user/:userName/tools/testvfs"
          element={
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Layout fullBleed>
                <AdminOnly><TestVfsPage /></AdminOnly>
              </Layout>
            </Box>
          }
        />
        <Route
          path="/user/:userName/tools/vnc"
          element={
            <RequireAuth>
              <Box sx={{ display: 'flex', minHeight: '100vh' }}>
                <Layout fullBleed hideChrome>
                  <VncPage />
                </Layout>
              </Box>
            </RequireAuth>
          }
        />
        <Route
          path="/user/:userName/programming/uml"
          element={
            <RequireAuth>
              <Box sx={{ display: 'flex', minHeight: '100vh' }}>
                <Layout fullBleed hideChrome>
                  <Suspense fallback={null}><UmlEditorPage /></Suspense>
                </Layout>
              </Box>
            </RequireAuth>
          }
        />
        <Route
          path="/user/:userName/programming/minisc"
          element={
            <RequireAuth>
              <Box sx={{ display: 'flex', minHeight: '100vh' }}>
                <Layout fullBleed>
                  <Suspense fallback={null}><MiniscPage /></Suspense>
                </Layout>
              </Box>
            </RequireAuth>
          }
        />
        {/* Drive is a full-page file manager — same `Layout fullBleed`
            shape as Electronics Configuration / TestVfs so the inner
            flex column gets the exact remaining viewport height (no
            padding, no `Container maxWidth`). Was previously mounted
            under the default Layout which wrapped it in `Container`
            with 24px padding, so DrivePage's `calc(100vh - 64px)`
            overshot the viewport by ~48px on macOS. */}
        <Route
          path="/user/:userName/pim/drive"
          element={
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Layout fullBleed hideChrome>
                <DrivePage />
              </Layout>
            </Box>
          }
        />

        {/* Pulpit — widget dashboard, full-bleed like Drive so the
            floating-widget canvas gets the full remaining viewport. */}
        <Route
          path="/user/:userName/pim/pulpit"
          element={
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Layout fullBleed hideChrome>
                <PulpitPage />
              </Layout>
            </Box>
          }
        />

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
                  <Route path="/admin/:userName/scripts" element={<ScriptsPage />} />
                  <Route path="/admin/:userName/github-projectdefs" element={<GithubProjectDefsPage />} />
                  <Route path="/admin/:userName/app-sessions" element={<AppSessionsPage />} />


                  {/* Minis user */}
                  <Route path="/user/:userName/main" element={<UserDashboardPage />} />
                  <Route path="/user/:userName/localization" element={<LocalizationPage />} />
                  <Route path="/user/:userName/electronics/welcome" element={<ElectronicsWelcomePage />} />
                  <Route path="/user/:userName/electronics/devices" element={<UserDevicesPage />} />
                  <Route path="/user/:userName/electronics/devicesdefs" element={<DevicesDefPage />} />
                  <Route path="/user/:userName/electronics/arduino" element={<UserProjectsPage />} />
                  <Route path="/user/:userName/electronics/upython" element={<UserUPythonProjectsPage />} />
                  <Route path="/user/:userName/electronics/pygame" element={<UserPygameProjectsPage />} />
                  <Route path="/user/:userName/electronics/picosdk" element={<UserPicoSdkProjectsPage />} />
                  <Route path="/user/:userName/electronics/cpp" element={<UserCppProjectsPage />} />
                  <Route path="/user/:userName/iot/dashboard" element={<IotDashboardPage />} />
                  <Route path="/user/:userName/iot/dashboard2" element={<IotDashboard2Page />} />
                  <Route path="/user/:userName/iot/dashboard2/config" element={<IotDashboard2ConfigPage />} />
                  <Route path="/user/:userName/iot/devices" element={<IotDevicesPage />} />
                  <Route path="/user/:userName/iot/device/:deviceName" element={<IotDevicePage />} />
                  <Route path="/user/:userName/iot/smart-display/:deviceName" element={<SmartDisplayPage />} />
                  <Route path="/user/:userName/iot/virtual-display/:deviceName" element={<VirtualDisplayPage />} />
                  <Route path="/user/:userName/iot/alerts" element={<IotAlertsPage />} />
                  <Route path="/user/:userName/iot/notifications" element={<IotNotificationsPage />} />
                  <Route path="/user/:userName/iot/automations" element={<IotAutomationsPage />} />
                  <Route path="/user/:userName/iot/retention" element={<IotRetentionPage />} />
                  <Route path="/user/:userName/iot/emulator" element={<IotEmulatorPage />} />
                  <Route path="/user/:userName/iot/aura" element={<IotAuraPage />} />
                  <Route path="/user/:userName/iot/aura/conversation-editor" element={<IotAuraConversationEditorPage />} />
                  <Route path="/user/:userName/programming/components" element={<Suspense fallback={null}><LitComponentsPage /></Suspense>} />
                  <Route path="/user/:userName/programming/server-logic" element={<AdminOnly><Suspense fallback={null}><ServerLogicPage /></Suspense></AdminOnly>} />
                  <Route path="/user/:userName/tools/rpc" element={<AdminOnly><RpcExplorerPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/mqtt-explorer" element={<AdminOnly><MqttExplorerPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/api-keys" element={<AdminOnly><ApiKeysPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/docs" element={<AdminOnly><DocsPage /></AdminOnly>} />
                  <Route path="/user/:userName/tools/ui-docs" element={<UiDocsPage />} />

                  {/* Pim pages under /user/:userName */}
                  <Route path="/user/:userName/pim/calendar" element={<CalendarPage />} />
                  <Route path="/user/:userName/pim/todolist" element={<ToDoListPage />} />
                  <Route path="/user/:userName/pim/person" element={<CastlePersonPage />} />
                  <Route path="/user/:userName/pim/project" element={<CastleProjectPage />} />
                  <Route path="/user/:userName/pim/shopping" element={<ShoppingPage />} />
                  <Route path="/user/:userName/pim/health" element={<HealthPage />} />
                  <Route path="/user/:userName/pim/memory" element={<MemoryPage />} />
                  {/* /pim/drive is handled by a dedicated `Layout fullBleed`
                      route above — kept out of this block so it doesn't get
                      wrapped in <Container maxWidth="lg"> + 24px padding. */}
                  <Route path="/user/:userName/pim/automate" element={<AutomateListPage />} />
                  <Route path="/user/:userName/pim/objectviewer" element={<ObjectViewerPage />} />
                  <Route path="/user/:userName/pim/components" element={<ComponentsPage />} />
                  <Route path="/user/:userName/pim/settings/ai" element={<AiSettingsPage />} />
                  <Route path="/user/:userName/pim/settings/speech" element={<SpeechSettingsPage />} />
                  <Route path="/user/:userName/pim/settings/receipt" element={<ReceiptSettingsPage />} />
                  <Route path="/user/:userName/pim/settings/page-hooks" element={<PageHooksSettingsPage />} />
                  <Route path="/user/:userName/pim/agent" element={<CastleAgentPage />} />
                  <Route path="*" element={<MdFileRedirect />} />
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
