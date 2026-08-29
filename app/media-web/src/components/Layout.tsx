/**
 * Rama aplikacji: pasek u góry, wysuwane menu po lewej, treść pod spodem.
 *
 * Układ przeniesiony z `mycastle-web/src/components/Layout.tsx` — ta sama
 * szerokość szuflady, ten sam podział na trzy warianty (telefon, tablet,
 * biurko) i ta sama zasada, że na wąskim ekranie menu jest tymczasowe,
 * a na szerokim stałe. Różnica jest jedna: tu nie ma logowania, więc nie ma
 * ani menu konta, ani ścieżek zależnych od nazwy użytkownika.
 *
 * Panel odtwarzacza siedzi **pod** treścią i poza obszarem przewijania, żeby
 * został na ekranie przy każdym przewinięciu listy odcinków.
 */

import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Box, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Typography,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Podcasts as PodcastsIcon,
  LibraryMusic as LibraryMusicIcon,
  StickyNote2 as StickyNote2Icon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material';
import { PlayerBar } from './PlayerBar';

const drawerWidth = 200;

interface NavItem {
  text: string;
  icon: ReactNode;
  path: string;
}

const menuItems: NavItem[] = [
  { text: 'Podcasts', icon: <PodcastsIcon />, path: '/podcasts' },
  { text: 'Kolejka', icon: <LibraryMusicIcon />, path: '/queue' },
  { text: 'Notatki', icon: <StickyNote2Icon />, path: '/notes' },
  { text: 'Kasia', icon: <SmartToyIcon />, path: '/kasia' },
];

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabletOpen, setTabletOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const go = (path: string) => {
    navigate(path);
    setMobileOpen(false);
    setTabletOpen(false);
  };

  const drawer = (
    <Box>
      <Toolbar>
        <PodcastsIcon sx={{ mr: 1 }} />
        <Typography variant="h6" noWrap component="div">Media</Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton selected={location.pathname === item.path} onClick={() => go(item.path)}>
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="static"
        sx={{ flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { xs: 'flex', sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <IconButton color="inherit" edge="start" onClick={() => setTabletOpen(!tabletOpen)} sx={{ mr: 2, display: { xs: 'none', sm: 'flex', lg: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>Media</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Telefon — szuflada tymczasowa */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
        {/* Tablet — szuflada tymczasowa */}
        <Drawer
          variant="temporary"
          anchor="left"
          open={tabletOpen}
          onClose={() => setTabletOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'none', sm: 'block', lg: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
        {/* Biurko — stały pasek boczny */}
        <Box
          component="nav"
          sx={{
            display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', width: drawerWidth,
            flexShrink: 0, borderRight: 1, borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.paper',
          }}
        >
          {drawer}
        </Box>

        <Box component="main" sx={{ flex: 1, overflow: 'auto', p: { xs: 1.5, sm: 3 } }}>
          {children}
        </Box>
      </Box>

      <PlayerBar />
    </Box>
  );
}
