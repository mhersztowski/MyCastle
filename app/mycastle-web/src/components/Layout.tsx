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
  RecordVoiceOver as RecordVoiceOverIcon,
  ReceiptLong as ReceiptLongIcon,
  Webhook as WebhookIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
  Terminal as TerminalIcon,
  CloudDownload as CloudDownloadIcon,
} from '@mui/icons-material';
import { useAuth } from '@modules/auth';
import ImpersonationBanner from './ImpersonationBanner';
import { AccountMenu } from './AccountMenu';

const drawerWidth = 200;

interface LayoutProps {
  children: React.ReactNode;
  fullBleed?: boolean;
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

function Layout({ children, fullBleed }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Electronics: true,
    IoT: true,
    Pim: true,
    Server: true,
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
{ text: 'Scripts', icon: <TerminalIcon />, path: `/admin/${userName}/scripts` },
        { text: 'GitHub Import', icon: <CloudDownloadIcon />, path: `/admin/${userName}/github-projectdefs` },
      ];
    }
    if (isMinisView) {
      return [
        { text: 'Main', icon: <HomeIcon />, path: `/user/${userName}/main` },
        {
          text: 'Electronics', icon: <DeveloperBoardIcon />, children: [
            { text: 'Devices', icon: <DeveloperBoardIcon />, path: `/user/${userName}/electronics/devices` },
            { text: 'DevicesDef', icon: <DevicesIcon />, path: `/user/${userName}/electronics/devicesdefs` },
            { text: 'Arduino', icon: <CodeIcon />, path: `/user/${userName}/electronics/arduino` },
            { text: 'uPython', icon: <CodeIcon />, path: `/user/${userName}/electronics/upython` },
            { text: 'Configuration', icon: <HubIcon />, path: `/user/${userName}/electronics/configuration` },
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
            { text: 'Notes', icon: <NotesIcon />, path: `/workspace/md` },
            { text: 'Calendar', icon: <CalendarMonthIcon />, path: `/user/${userName}/pim/calendar` },
            { text: 'To-Do List', icon: <ChecklistIcon />, path: `/user/${userName}/pim/todolist` },
            { text: 'Shopping', icon: <ShoppingCartIcon />, path: `/user/${userName}/pim/shopping` },
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
        ...(isAdmin && !impersonating ? [{
          text: 'Tools', icon: <BuildIcon />, children: [
            { text: 'API Keys', icon: <VpnKeyIcon />, path: `/user/${userName}/tools/api-keys` },
            { text: 'Test VFS', icon: <AccountTreeIcon />, path: `/user/${userName}/tools/testvfs` },
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

  const bannerOffset = impersonating ? '40px' : '0px';

  return (
    <>
      <ImpersonationBanner />
      <Box sx={{ position: 'fixed', inset: 0, top: bannerOffset, display: 'flex', flexDirection: 'column' }}>
        {/* AppBar — static, part of the flex column, no hardcoded margins needed */}
        <AppBar
          position="static"
          sx={{
            flexShrink: 0,
            paddingTop: 'env(safe-area-inset-top)',
            zIndex: (theme) => theme.zIndex.drawer + 1,
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

        {/* Body row: sidebar + content */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Temporary drawer for mobile */}
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

          {/* Permanent sidebar for desktop — relative positioning so it fits the flex layout */}
          <Box
            component="nav"
            sx={{
              display: { xs: 'none', sm: 'flex' },
              flexDirection: 'column',
              width: drawerWidth,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              overflowY: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            {drawer}
          </Box>

          {/* Main content */}
          <Box
            component="main"
            sx={{
              flex: 1,
              overflow: fullBleed ? 'hidden' : 'auto',
              p: fullBleed ? 0 : 3,
              display: fullBleed ? 'flex' : undefined,
              flexDirection: fullBleed ? 'column' : undefined,
            }}
          >
            {fullBleed ? children : (
              <Container maxWidth="lg">
                {children}
              </Container>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}

export default Layout;
