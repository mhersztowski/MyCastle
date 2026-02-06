import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import FolderIcon from '@mui/icons-material/Folder';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import WidgetsIcon from '@mui/icons-material/Widgets';
import PersonIcon from '@mui/icons-material/Person';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CastleIcon from '@mui/icons-material/Castle';
import PsychologyIcon from '@mui/icons-material/Psychology';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import WebhookIcon from '@mui/icons-material/Webhook';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

const drawerWidth = 240;

interface LayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  {
    text: 'File Browser',
    icon: <ListAltIcon />,
    path: '/filesystem/list',
  },
  {
    text: 'Calendar',
    icon: <CalendarMonthIcon />,
    path: '/calendar',
  },
  {
    text: 'To-Do List',
    icon: <ChecklistIcon />,
    path: '/todolist',
  },
  {
    text: 'Shopping',
    icon: <ShoppingCartIcon />,
    path: '/shopping',
  },
  {
    text: 'Persons',
    icon: <PersonIcon />,
    path: '/person',
  },
  {
    text: 'Projects',
    icon: <FolderIcon />,
    path: '/project',
  },
  {
    text: 'Automate',
    icon: <AccountTreeIcon />,
    path: '/automate',
  },
  {
    text: 'Object Viewer',
    icon: <ManageSearchIcon />,
    path: '/objectviewer',
  },
  {
    text: 'Components',
    icon: <WidgetsIcon />,
    path: '/components',
  },
  {
    text: 'Castle Agent',
    icon: <SmartToyIcon />,
    path: '/agent',
  },
];

const settingsItems = [
  {
    text: 'AI',
    icon: <PsychologyIcon />,
    path: '/settings/ai',
  },
  {
    text: 'Speech',
    icon: <RecordVoiceOverIcon />,
    path: '/settings/speech',
  },
  {
    text: 'Receipt',
    icon: <ReceiptLongIcon />,
    path: '/settings/receipt',
  },
  {
    text: 'Page Hooks',
    icon: <WebhookIcon />,
    path: '/settings/page-hooks',
  },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() =>
    location.pathname.startsWith('/settings')
  );

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleSettingsClick = () => {
    setSettingsOpen(!settingsOpen);
  };

  const isSettingsActive = location.pathname.startsWith('/settings');

  const drawer = (
    <Box>
      <Toolbar>
        <CastleIcon sx={{ mr: 1 }} />
        <Typography variant="h6" noWrap>
          MyCastle
        </Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: theme.palette.primary.light + '20',
                  borderRight: `3px solid ${theme.palette.primary.main}`,
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: location.pathname === item.path ? theme.palette.primary.main : 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}

        {/* Settings group */}
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleSettingsClick}
            sx={{
              backgroundColor: isSettingsActive ? theme.palette.primary.light + '10' : 'transparent',
            }}
          >
            <ListItemIcon
              sx={{
                color: isSettingsActive ? theme.palette.primary.main : 'inherit',
              }}
            >
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" />
            {settingsOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
        </ListItem>
        <Collapse in={settingsOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {settingsItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileOpen(false);
                  }}
                  sx={{
                    pl: 4,
                    '&.Mui-selected': {
                      backgroundColor: theme.palette.primary.light + '20',
                      borderRight: `3px solid ${theme.palette.primary.main}`,
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: location.pathname === item.path ? theme.palette.primary.main : 'inherit',
                      minWidth: 36,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Collapse>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
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
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <FolderIcon sx={{ mr: 1 }} />
          <Typography variant="h6" noWrap component="div">
            Filesystem
          </Typography>
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
};

export default Layout;
