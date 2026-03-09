import { useState, useMemo } from 'react';
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
  Memory as MemoryIcon,
  DeveloperBoard as DeveloperBoardIcon,
  Devices as DevicesIcon,
  Code as CodeIcon,
  Assignment as AssignmentIcon,
  Dashboard as DashboardIcon,
  Sensors as SensorsIcon,
  NotificationsActive as NotificationsActiveIcon,
  BugReport as BugReportIcon,
  Router as RouterIcon,
  Build as BuildIcon,
  Api as ApiIcon,
  Hub as HubIcon,
  VpnKey as VpnKeyIcon,
  AccountTree as AccountTreeIcon,
  Description as DescriptionIcon,
  Notes as NotesIcon,
  LocationOn as LocationOnIcon,
  Castle as CastleIcon,
  Apps as AppsIcon,
  CalendarMonth as CalendarMonthIcon,
  Checklist as ChecklistIcon,
  Person as PersonIcon,
  SmartToy as SmartToyIcon,
  ShoppingCart as ShoppingCartIcon,
  Psychology as PsychologyIcon,
  RecordVoiceOver as RecordVoiceOverIcon,
  ReceiptLong as ReceiptLongIcon,
  Webhook as WebhookIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material';
import { useAuth } from '@modules/auth';
import ImpersonationBanner from './ImpersonationBanner';
import { AccountMenu } from './AccountMenu';

const drawerWidth = 200;

interface LayoutProps {
  children: React.ReactNode;
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

function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Electronics: true,
    IoT: true,
    Tools: true,
    Settings: false,
  });
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
        { text: 'DevicesDef', icon: <DevicesIcon />, path: `/admin/${userName}/devicesdefs` },
        { text: 'ModulesDef', icon: <MemoryIcon />, path: `/admin/${userName}/modulesdefs` },
        { text: 'ProjectDefs', icon: <AssignmentIcon />, path: `/admin/${userName}/projectdefs` },
      ];
    }
    if (isMinisView) {
      return [
        { text: 'Main', icon: <HomeIcon />, path: `/user/${userName}/main` },
        { text: 'Localization', icon: <LocationOnIcon />, path: `/user/${userName}/localization` },
        {
          text: 'Electronics', icon: <DeveloperBoardIcon />, children: [
            { text: 'Devices', icon: <DeveloperBoardIcon />, path: `/user/${userName}/electronics/devices` },
            { text: 'Arduino', icon: <CodeIcon />, path: `/user/${userName}/electronics/arduino` },
            { text: 'uPython', icon: <CodeIcon />, path: `/user/${userName}/electronics/upython` },
          ],
        },
        {
          text: 'IoT', icon: <RouterIcon />, children: [
            { text: 'Dashboard', icon: <DashboardIcon />, path: `/user/${userName}/iot/dashboard` },
            { text: 'Devices', icon: <SensorsIcon />, path: `/user/${userName}/iot/devices` },
            { text: 'Alerts', icon: <NotificationsActiveIcon />, path: `/user/${userName}/iot/alerts` },
            { text: 'Emulator', icon: <BugReportIcon />, path: `/user/${userName}/iot/emulator` },
          ],
        },
        {
          text: 'Pim', icon: <AppsIcon />, children: [
            { text: 'Calendar', icon: <CalendarMonthIcon />, path: `/user/${userName}/pim/calendar` },
            { text: 'To-Do List', icon: <ChecklistIcon />, path: `/user/${userName}/pim/todolist` },
            { text: 'Shopping', icon: <ShoppingCartIcon />, path: `/user/${userName}/pim/shopping` },
            { text: 'Persons', icon: <PersonIcon />, path: `/user/${userName}/pim/person` },
            { text: 'Projects', icon: <FolderIcon />, path: `/user/${userName}/pim/project` },
            { text: 'Automate', icon: <AccountTreeIcon />, path: `/user/${userName}/pim/automate` },
            { text: 'Agent', icon: <SmartToyIcon />, path: `/user/${userName}/pim/agent` },
            { text: 'Notes', icon: <NotesIcon />, path: `/workspace/md` },
          ],
        },
        ...(isAdmin && !impersonating ? [{
          text: 'Tools', icon: <BuildIcon />, children: [
            { text: 'RPC Explorer', icon: <ApiIcon />, path: `/user/${userName}/tools/rpc` },
            { text: 'MQTT Explorer', icon: <HubIcon />, path: `/user/${userName}/tools/mqtt-explorer` },
            { text: 'API Keys', icon: <VpnKeyIcon />, path: `/user/${userName}/tools/api-keys` },
            { text: 'Test VFS', icon: <AccountTreeIcon />, path: `/user/${userName}/tools/testvfs` },
            { text: 'API Docs', icon: <DescriptionIcon />, path: `/user/${userName}/tools/docs` },
          ],
        }, {
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
                        onClick={() => { navigate(child.path!); setMobileOpen(false); }}
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
                onClick={() => { navigate(item.path!); setMobileOpen(false); }}
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

  const bannerOffset = impersonating ? '40px' : 0;

  return (
    <>
      <ImpersonationBanner />
      <Box sx={{ display: 'flex', minHeight: '100vh', mt: bannerOffset }}>
        <AppBar
          position="fixed"
          sx={{
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            ml: { sm: `${drawerWidth}px` },
            top: bannerOffset,
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              MyCastle — {sectionLabel}
              {impersonating && <Chip label={`as ${impersonating.name}`} size="small" color="warning" />}
            </Typography>
            <AccountMenu isAdminView={isAdminView} userName={userName} />
          </Toolbar>
        </AppBar>
        <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
            }}
          >
            {drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                ...(impersonating ? { top: '40px', height: 'calc(100% - 40px)' } : {}),
              },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            mt: 'calc(64px + env(safe-area-inset-top))',
          }}
        >
          <Container maxWidth="lg">
            {children}
          </Container>
        </Box>
      </Box>
    </>
  );
}

export default Layout;
