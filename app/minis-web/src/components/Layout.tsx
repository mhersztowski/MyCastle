import { useState, useMemo } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  Folder as FolderIcon,
  Logout as LogoutIcon,
  People as PeopleIcon,
  Memory as MemoryIcon,
  Devices as DevicesIcon,
  Assignment as AssignmentIcon,
  AccountCircle as AccountCircleIcon,
  SwapHoriz as SwapHorizIcon,
  Dashboard as DashboardIcon,
  Sensors as SensorsIcon,
  NotificationsActive as NotificationsActiveIcon,
  BugReport as BugReportIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@modules/auth';

const drawerWidth = 180;

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

function extractUserName(pathname: string): string {
  const match = pathname.match(/^\/(admin|user)\/([^/]+)/);
  return match ? match[2] : '';
}

function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isAdmin, logout } = useAuth();

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
      { text: 'Devices', icon: <DevicesIcon />, path: `/user/${userName}/devices` },
      { text: 'Projects', icon: <AssignmentIcon />, path: `/user/${userName}/projects` },
      { text: 'IoT Dashboard', icon: <DashboardIcon />, path: `/user/${userName}/iot/dashboard` },
      { text: 'IoT Devices', icon: <SensorsIcon />, path: `/user/${userName}/iot/devices` },
      { text: 'IoT Alerts', icon: <NotificationsActiveIcon />, path: `/user/${userName}/iot/alerts` },
      { text: 'IoT Emulator', icon: <BugReportIcon />, path: `/user/${userName}/iot/emulator` },
    ];
  }, [isAdminView, userName]);

  const sectionLabel = isAdminView ? 'Admin' : 'User';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    setAccountMenuAnchor(null);
    logout();
    navigate('/');
  };

  const handleSwitchView = () => {
    setAccountMenuAnchor(null);
    if (isAdminView) {
      navigate(`/user/${userName}/main`);
    } else {
      navigate(`/admin/${userName}/main`);
    }
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Minis
        </Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
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
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Minis - {sectionLabel}
          </Typography>
          <IconButton
            color="inherit"
            onClick={(e) => setAccountMenuAnchor(e.currentTarget)}
          >
            <AccountCircleIcon />
          </IconButton>
          <Menu
            anchorEl={accountMenuAnchor}
            open={Boolean(accountMenuAnchor)}
            onClose={() => setAccountMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {currentUser && (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {currentUser.name}
                </Typography>
              </MenuItem>
            )}
            {isAdmin && (
              <MenuItem onClick={handleSwitchView}>
                <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{isAdminView ? 'Switch to User' : 'Switch to Admin'}</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
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
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
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
  );
}

export default Layout;
