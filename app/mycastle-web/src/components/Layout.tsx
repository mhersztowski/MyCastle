import { useState, useMemo, createContext, useContext } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Chip,
  Collapse,
  Container,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  Folder as FolderIcon,
  People as PeopleIcon,
  DeveloperBoard as DeveloperBoardIcon,
  Devices as DevicesIcon,
  Code as CodeIcon,
  Dashboard as DashboardIcon,
  Sensors as SensorsIcon,
  NotificationsActive as NotificationsActiveIcon,
  BugReport as BugReportIcon,
  Router as RouterIcon,
  Hub as HubIcon,
  Build as BuildIcon,
  VpnKey as VpnKeyIcon,
  AccountTree as AccountTreeIcon,
  Notes as NotesIcon,
  LocationOn as LocationOnIcon,
  Storage as StorageIcon,
  Castle as CastleIcon,
  Apps as AppsIcon,
  CalendarMonth as CalendarMonthIcon,
  Checklist as ChecklistIcon,
  Person as PersonIcon,
  SmartToy as SmartToyIcon,
  ShoppingCart as ShoppingCartIcon,
  Psychology as PsychologyIcon,
  DriveFolderUpload as DriveFolderUploadIcon,
  RecordVoiceOver as RecordVoiceOverIcon,
  ReceiptLong as ReceiptLongIcon,
  Webhook as WebhookIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
  Terminal as TerminalIcon,
  CloudDownload as CloudDownloadIcon,
  Storefront as StorefrontIcon,
  PhotoLibrary as PhotoLibraryIcon,
  AutoMode as AutoModeIcon,
  Notifications as NotificationsIcon,
  FitnessCenter as FitnessCenterIcon,
  IntegrationInstructions as IntegrationInstructionsIcon,
  Schema as SchemaIcon,
  Memory as MemoryIcon,
  Dns as DnsIcon,
  Widgets as WidgetsIcon,
} from '@mui/icons-material';
import { useAuth } from '@modules/auth';
import ImpersonationBanner from './ImpersonationBanner';
import { AccountMenu } from './AccountMenu';

const drawerWidth = 200;

/**
 * Lets a `hideChrome` page (e.g. the full-screen UML editor) render the main
 * navigation trigger inside its own toolbar instead of the global AppBar.
 */
interface LayoutChrome { openNav: () => void }
const LayoutChromeContext = createContext<LayoutChrome>({ openNav: () => {} });
export const useLayoutChrome = () => useContext(LayoutChromeContext);

interface LayoutProps {
  children: React.ReactNode;
  fullBleed?: boolean;
  /** Hide the blue AppBar + permanent sidebar; nav becomes a drawer the page opens via useLayoutChrome(). */
  hideChrome?: boolean;
}

interface NavItem {
  text: string;
  icon: React.ReactNode;
  path?: string;
  children?: NavItem[];
}

function extractUserName(pathname: string): string {
  const match = pathname.match(/^\/(admin|user)\/([^/]+)/);
  return match ? match[2] : '';
}

function Layout({ children, fullBleed, hideChrome }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabletOpen, setTabletOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // hideChrome: page-triggered nav drawer
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isAdmin, impersonating } = useAuth();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  const isAdminView = location.pathname.startsWith('/admin');
  const isMinisView = location.pathname.startsWith('/admin') || location.pathname.startsWith('/user');
  const userName = extractUserName(location.pathname) || currentUser.name;

  const menuItems = useMemo((): NavItem[] => {
    if (isAdminView) {
      return [
        { text: 'Main', icon: <HomeIcon />, path: `/admin/${userName}/main` },
        { text: 'Users', icon: <PeopleIcon />, path: `/admin/${userName}/users` },
        { text: 'Scripts', icon: <TerminalIcon />, path: `/admin/${userName}/scripts` },
        { text: 'App Sessions', icon: <AppsIcon />, path: `/admin/${userName}/app-sessions` },
        { text: 'GitHub Import', icon: <CloudDownloadIcon />, path: `/admin/${userName}/github-projectdefs` },
        { text: 'Server Logic', icon: <DnsIcon />, path: `/user/${userName}/programming/server-logic` },
      ];
    }
    if (isMinisView) {
      return [
        { text: 'Main', icon: <HomeIcon />, path: `/user/${userName}/main` },
        { text: 'Drive', icon: <DriveFolderUploadIcon />, path: `/user/${userName}/pim/drive` },
        { text: 'Pulpit', icon: <DashboardIcon />, path: `/user/${userName}/pim/pulpit` },
        {
          text: 'Electronics', icon: <DeveloperBoardIcon />, children: [
            { text: 'Welcome', icon: <StorefrontIcon />, path: `/user/${userName}/electronics/welcome` },
            { text: 'Devices', icon: <DeveloperBoardIcon />, path: `/user/${userName}/electronics/devices` },
            { text: 'DevicesDef', icon: <DevicesIcon />, path: `/user/${userName}/electronics/devicesdefs` },
            { text: 'Arduino', icon: <CodeIcon />, path: `/user/${userName}/electronics/arduino` },
            { text: 'uPython', icon: <CodeIcon />, path: `/user/${userName}/electronics/upython` },
            { text: 'Pygame', icon: <CodeIcon />, path: `/user/${userName}/electronics/pygame` },
            { text: 'PicoSDK', icon: <CodeIcon />, path: `/user/${userName}/electronics/picosdk` },
            { text: 'C++', icon: <CodeIcon />, path: `/user/${userName}/electronics/cpp` },
            { text: 'Configuration', icon: <HubIcon />, path: `/user/${userName}/electronics/configuration` },
          ],
        },
        {
          text: 'Programming', icon: <IntegrationInstructionsIcon />, children: [
            { text: 'UML', icon: <SchemaIcon />, path: `/user/${userName}/programming/uml` },
            { text: 'MinisC', icon: <MemoryIcon />, path: `/user/${userName}/programming/minisc` },
            { text: 'Components', icon: <WidgetsIcon />, path: `/user/${userName}/programming/components` },
            { text: 'Server Logic', icon: <DnsIcon />, path: `/user/${userName}/programming/server-logic` },
          ],
        },
        {
          text: 'IoT', icon: <RouterIcon />, children: [
            { text: 'Dashboard', icon: <DashboardIcon />, path: `/user/${userName}/iot/dashboard` },
            { text: 'Dashboard 2', icon: <DashboardIcon />, path: `/user/${userName}/iot/dashboard2` },
            { text: 'Devices', icon: <SensorsIcon />, path: `/user/${userName}/iot/devices` },
            { text: 'Alerts', icon: <NotificationsActiveIcon />, path: `/user/${userName}/iot/alerts` },
            { text: 'Notifications', icon: <NotificationsIcon />, path: `/user/${userName}/iot/notifications` },
            { text: 'Automations', icon: <AutoModeIcon />, path: `/user/${userName}/iot/automations` },
            { text: 'Retention', icon: <StorageIcon />, path: `/user/${userName}/iot/retention` },
            { text: 'Emulator', icon: <BugReportIcon />, path: `/user/${userName}/iot/emulator` },
          ],
        },
        {
          text: 'Pim', icon: <AppsIcon />, children: [
            { text: 'Notes', icon: <NotesIcon />, path: `/workspace/md` },
            { text: 'Calendar', icon: <CalendarMonthIcon />, path: `/user/${userName}/pim/calendar` },
            { text: 'To-Do List', icon: <ChecklistIcon />, path: `/user/${userName}/pim/todolist` },
            { text: 'Shopping', icon: <ShoppingCartIcon />, path: `/user/${userName}/pim/shopping` },
            { text: 'Health', icon: <FitnessCenterIcon />, path: `/user/${userName}/pim/health` },
            { text: 'Memory', icon: <PsychologyIcon />, path: `/user/${userName}/pim/memory` },
            { text: 'Persons', icon: <PersonIcon />, path: `/user/${userName}/pim/person` },
            { text: 'Projects', icon: <FolderIcon />, path: `/user/${userName}/pim/project` },
            { text: 'Agent', icon: <SmartToyIcon />, path: `/user/${userName}/pim/agent` },
            { text: 'Localization', icon: <LocationOnIcon />, path: `/user/${userName}/localization` },
          ],
        },
        {
          text: 'Server', icon: <StorageIcon />, children: [
            { text: 'Automate', icon: <AccountTreeIcon />, path: `/user/${userName}/pim/automate` },
          ],
        },
        {
          text: 'Tools', icon: <BuildIcon />, children: [
            { text: 'UI Docs', icon: <PhotoLibraryIcon />, path: `/user/${userName}/tools/ui-docs` },
            ...(isAdmin && !impersonating ? [
              { text: 'API Keys', icon: <VpnKeyIcon />, path: `/user/${userName}/tools/api-keys` },
              { text: 'Test VFS', icon: <AccountTreeIcon />, path: `/user/${userName}/tools/testvfs` },
              { text: 'Docs', icon: <CodeIcon />, path: `/user/${userName}/tools/docs` },
            ] : []),
          ],
        },
        ...(isAdmin && !impersonating ? [{
          text: 'Castle Settings', icon: <SettingsIcon />, children: [
            { text: 'AI', icon: <PsychologyIcon />, path: `/user/${userName}/pim/settings/ai` },
            { text: 'Speech', icon: <RecordVoiceOverIcon />, path: `/user/${userName}/pim/settings/speech` },
            { text: 'Receipt', icon: <ReceiptLongIcon />, path: `/user/${userName}/pim/settings/receipt` },
            { text: 'Page Hooks', icon: <WebhookIcon />, path: `/user/${userName}/pim/settings/page-hooks` },
          ],
        }] : []),
      ];
    }
    return [];
  }, [isAdminView, isMinisView, isAdmin, impersonating, userName]);

  const sectionLabel = isAdminView ? 'Admin' : 'User';

  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));

  const drawer = (
    <Box>
      <Toolbar>
        <CastleIcon sx={{ mr: 1 }} />
        <Typography variant="h6" noWrap component="div">
          MyCastle
        </Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) =>
          item.children ? (
            <Box key={item.text}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => toggleGroup(item.text)}
                  selected={item.children.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path ?? ''))}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                  {openGroups[item.text] ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
              </ListItem>
              <Collapse in={openGroups[item.text]} timeout="auto" unmountOnExit>
                <List disablePadding>
                  {item.children.map((child) => (
                    <ListItem key={child.text} disablePadding>
                      <ListItemButton
                        sx={{ pl: 4 }}
                        selected={location.pathname === child.path}
                        onClick={() => { navigate(child.path!); setMobileOpen(false); setTabletOpen(false); setNavOpen(false); }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>{child.icon}</ListItemIcon>
                        <ListItemText primary={child.text} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </Box>
          ) : (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => { navigate(item.path!); setMobileOpen(false); setTabletOpen(false); setNavOpen(false); }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          )
        )}
      </List>
    </Box>
  );

  const bannerOffset = impersonating ? '40px' : '0px';

  return (
    <LayoutChromeContext.Provider value={{ openNav: () => setNavOpen(true) }}>
      <ImpersonationBanner />
      <Box sx={{ position: 'fixed', top: bannerOffset, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column' }}>
        {/* AppBar — hidden in hideChrome mode (page renders nav + account in its own toolbar) */}
        {!hideChrome && (
          <AppBar position="static" sx={{ flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
              <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { xs: 'flex', sm: 'none' } }}><MenuIcon /></IconButton>
              <IconButton color="inherit" edge="start" onClick={() => setTabletOpen(!tabletOpen)} sx={{ mr: 2, display: { xs: 'none', sm: 'flex', lg: 'none' } }}><MenuIcon /></IconButton>
              <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                MyCastle — {sectionLabel}
                {impersonating && <Chip label={`as ${impersonating.name}`} size="small" color="warning" />}
              </Typography>
              <AccountMenu isAdminView={isAdminView} userName={userName} />
            </Toolbar>
          </AppBar>
        )}

        {/* Body row: sidebar + content */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {hideChrome ? (
            /* Full-screen page: nav is a drawer the page opens via useLayoutChrome() */
            <Drawer variant="temporary" open={navOpen} onClose={() => setNavOpen(false)} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}>
              {drawer}
            </Drawer>
          ) : (
            <>
              {/* Mobile — temporary left drawer */}
              <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}>{drawer}</Drawer>
              {/* Tablet — temporary left drawer */}
              <Drawer variant="temporary" anchor="left" open={tabletOpen} onClose={() => setTabletOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'none', sm: 'block', lg: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}>{drawer}</Drawer>
              {/* Desktop — permanent left sidebar */}
              <Box component="nav" sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', width: drawerWidth, flexShrink: 0, borderRight: 1, borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.paper' }}>{drawer}</Box>
            </>
          )}

          {/* Main content */}
          <Box component="main" sx={{ flex: 1, overflow: fullBleed ? 'hidden' : 'auto', p: fullBleed ? 0 : 3, display: fullBleed ? 'flex' : undefined, flexDirection: fullBleed ? 'column' : undefined }}>
            {fullBleed ? children : (<Container maxWidth="lg">{children}</Container>)}
          </Box>
        </Box>
      </Box>
    </LayoutChromeContext.Provider>
  );
}

export default Layout;
