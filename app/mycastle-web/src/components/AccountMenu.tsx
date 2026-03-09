import { useRef, useState } from 'react';
import { Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import {
  AccountCircle as AccountCircleIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Check as CheckIcon,
  ChevronRight as ChevronRightIcon,
  DataObject as DataObjectIcon,
  DeleteSweep as DeleteSweepIcon,
  Description as DescriptionIcon,
  FileDownload as FileDownloadIcon,
  FileUpload as FileUploadIcon,
  Logout as LogoutIcon,
  PlayArrow as RpcIcon,
  Schema as SchemaIcon,
  Sensors as MqttIcon,
  SwapHoriz as SwapHorizIcon,
  Terminal as TerminalIcon,
  Tune as TuneIcon,
  Visibility as VisibilityIcon,
  WebAsset as WebAssetIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@modules/auth';
import { useGlobalWindows } from './GlobalWindowsContext';
import { useDisplay } from './DisplayContext';

interface AccountMenuProps {
  isAdminView?: boolean;
  userName?: string;
}

export function AccountMenu({ isAdminView = false, userName: userNameProp }: AccountMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [subMenu, setSubMenu] = useState<'view' | 'window' | 'display' | null>(null);
  const subMenuAnchorRef = useRef<HTMLLIElement | null>(null);
  const { themeMode, size, setThemeMode, setSize } = useDisplay();
  const navigate = useNavigate();
  const { currentUser, isAdmin, logout, impersonating, stopImpersonating } = useAuth();
  const { toggle, saveLayout, loadLayout, clearLayout } = useGlobalWindows();

  const userName = userNameProp ?? currentUser?.name ?? '';

  const closeAll = () => {
    setAnchorEl(null);
    setSubMenu(null);
  };

  const handleLogout = () => {
    closeAll();
    logout();
    navigate('/');
  };

  const handleSwitchView = () => {
    closeAll();
    if (isAdminView) {
      navigate(`/user/${userName}/main`);
    } else if (impersonating) {
      stopImpersonating();
      navigate(`/admin/${currentUser!.name}/main`);
    } else {
      navigate(`/admin/${userName}/main`);
    }
  };

  return (
    <>
      <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
        <AccountCircleIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeAll}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {currentUser && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {currentUser.name}{impersonating ? ` (viewing ${impersonating.name})` : ''}
            </Typography>
          </MenuItem>
        )}
        {isAdmin && (
          <MenuItem onClick={handleSwitchView}>
            <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{isAdminView ? 'Switch to User' : impersonating ? 'Back to Admin' : 'Switch to Admin'}</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          ref={(el) => { if (subMenu === 'view') subMenuAnchorRef.current = el; }}
          onClick={(e) => { subMenuAnchorRef.current = e.currentTarget as HTMLLIElement; setSubMenu(subMenu === 'view' ? null : 'view'); }}
        >
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
        </MenuItem>
        <MenuItem
          ref={(el) => { if (subMenu === 'window') subMenuAnchorRef.current = el; }}
          onClick={(e) => { subMenuAnchorRef.current = e.currentTarget as HTMLLIElement; setSubMenu(subMenu === 'window' ? null : 'window'); }}
        >
          <ListItemIcon><WebAssetIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Window</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
        </MenuItem>
        <MenuItem
          ref={(el) => { if (subMenu === 'display') subMenuAnchorRef.current = el; }}
          onClick={(e) => { subMenuAnchorRef.current = e.currentTarget as HTMLLIElement; setSubMenu(subMenu === 'display' ? null : 'display'); }}
        >
          <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Display</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>

      {/* View submenu */}
      <Menu
        anchorEl={subMenuAnchorRef.current}
        open={subMenu === 'view'}
        onClose={() => setSubMenu(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={() => { closeAll(); saveLayout(); }}>
          <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Save</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeAll(); loadLayout(); }}>
          <ListItemIcon><FileUploadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Load</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeAll(); clearLayout(); }}>
          <ListItemIcon><DeleteSweepIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Clear</ListItemText>
        </MenuItem>
      </Menu>

      {/* Window submenu */}
      <Menu
        anchorEl={subMenuAnchorRef.current}
        open={subMenu === 'window'}
        onClose={() => setSubMenu(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={() => { closeAll(); toggle('apiDocs'); }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText>API Docs</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeAll(); toggle('rpcExplorer'); }}>
          <ListItemIcon><RpcIcon fontSize="small" /></ListItemIcon>
          <ListItemText>RPC Explorer</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeAll(); toggle('mqttExplorer'); }}>
          <ListItemIcon><MqttIcon fontSize="small" /></ListItemIcon>
          <ListItemText>MQTT Explorer</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeAll(); toggle('mjdDefEditor'); }}>
          <ListItemIcon><SchemaIcon fontSize="small" /></ListItemIcon>
          <ListItemText>MJD Def Editor</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeAll(); toggle('mjdDataEditor'); }}>
          <ListItemIcon><DataObjectIcon fontSize="small" /></ListItemIcon>
          <ListItemText>MJD Data Editor</ListItemText>
        </MenuItem>
        {isAdmin && (
          <MenuItem onClick={() => { closeAll(); toggle('terminal'); }}>
            <ListItemIcon><TerminalIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Terminal</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Display submenu */}
      <Menu
        anchorEl={subMenuAnchorRef.current}
        open={subMenu === 'display'}
        onClose={() => setSubMenu(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <Typography variant="caption" color="text.secondary">Theme</Typography>
        </MenuItem>
        <MenuItem onClick={() => setThemeMode('light')}>
          <ListItemIcon>
            {themeMode === 'light' ? <CheckIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>Light</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => setThemeMode('dark')}>
          <ListItemIcon>
            {themeMode === 'dark' ? <CheckIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>Dark</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <Typography variant="caption" color="text.secondary">Size</Typography>
        </MenuItem>
        {(['small', 'medium', 'large'] as const).map((s) => (
          <MenuItem key={s} onClick={() => setSize(s)}>
            <ListItemIcon>
              {size === s ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText sx={{ textTransform: 'capitalize' }}>{s}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
