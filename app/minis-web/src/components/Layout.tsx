import { useState, useMemo } from 'react';
import {
  AppBar,
  Box,
  Collapse,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Chip,
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
  ExpandLess,
  ExpandMore,
  Build as BuildIcon,
  Api as ApiIcon,
  Hub as HubIcon,
  VpnKey as VpnKeyIcon,
  AccountTree as AccountTreeIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@modules/auth';
import ImpersonationBanner from './ImpersonationBanner';
import { AccountMenu } from './AccountMenu';

const drawerWidth = 180;

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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Electronics: true, IoT: true, Tools: true });
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, impersonating } = useAuth();

  const userName = extractUserName(location.pathname);
  const isAdminView = location.pathname.startsWith('/admin');

  const menuItems = useMemo((): NavItem[] => {
    if (!userName) return [];
    if (isAdminView) {
      return [
        { text: 'Main', icon: <HomeIcon />, path: `/admin/${userName}/main` },
        { text: 'Users', icon: <PeopleIcon />, path: `/admin/${userName}/users` },
        { text: 'DevicesDef', icon: <DevicesIcon />, path: `/admin/${userName}/devicesdefs` },
        { text: 'ModulesDef', icon: <MemoryIcon />, path: `/admin/${userName}/modulesdefs` },
        { text: 'ProjectDefs', icon: <AssignmentIcon />, path: `/admin/${userName}/projectdefs` },
        { text: 'Files', icon: <FolderIcon />, path: `/admin/${userName}/filesystem/list` },
      ];
    }
    return [
      { text: 'Main', icon: <HomeIcon />, path: `/user/${userName}/main` },
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
      ...(isAdmin && !impersonating ? [{
        text: 'Tools', icon: <BuildIcon />, children: [
          { text: 'RPC Explorer', icon: <ApiIcon />, path: `/user/${userName}/tools/rpc` },
          { text: 'MQTT Explorer', icon: <HubIcon />, path: `/user/${userName}/tools/mqtt-explorer` },
          { text: 'API Keys', icon: <VpnKeyIcon />, path: `/user/${userName}/tools/api-keys` },
          { text: 'Test VFS', icon: <AccountTreeIcon />, path: `/user/${userName}/tools/testvfs` },
          { text: 'API Docs', icon: <DescriptionIcon />, path: `/user/${userName}/tools/docs` },
        ],
      }] : []),
    ];
  }, [isAdminView, isAdmin, impersonating, userName]);

  const sectionLabel = isAdminView ? 'Admin' : 'User';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const toggleGroup = (name: string) => setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Minis
        </Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) =>
          item.children ? (
            <Box key={item.text}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => toggleGroup(item.text)}
                  selected={item.children.some((c) => location.pathname === c.path)}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>{item.icon}</ListItemIcon>
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
                        onClick={() => navigate(child.path!)}
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
                onClick={() => navigate(item.path!)}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ),
        )}
      </List>
    </Box>
  );

  const bannerOffset = impersonating ? '40px' : 0;

  return (
    <>
    <ImpersonationBanner />
    <Box sx={{ display: 'flex', width: '100%', mt: bannerOffset }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          top: bannerOffset,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            Minis - {sectionLabel}
            {impersonating && <Chip label={`as ${impersonating.name}`} size="small" color="warning" />}
          </Typography>
          <AccountMenu isAdminView={isAdminView} userName={userName} />
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
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
          mt: 8,
        }}
      >
        {children}
      </Box>
    </Box>
    </>
  );
}

export default Layout;
