import { Fragment, useState } from 'react';
import { Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useFileOps, type FileMenuItem } from '../fileops/FileOpsContext';

/** Single, always-visible File menu — renders the active mode's registered actions. */
export function FileMenu({ mode }: { mode: string }) {
  const { get, version } = useFileOps();
  void version; // re-render when the registry changes
  const ops = get(mode);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  const renderItems = (items: FileMenuItem[] | undefined, Icon: typeof FolderOpenOutlinedIcon) =>
    (items ?? []).map((it, i) => (
      <MenuItem
        key={`${it.label}-${i}`}
        dense
        disabled={it.disabled}
        onClick={() => { close(); it.run(); }}
      >
        <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
        <ListItemText primary={it.label} secondary={it.secondary} />
      </MenuItem>
    ));

  const hasServer = (ops?.server?.length ?? 0) > 0;
  const hasImport = (ops?.importItems?.length ?? 0) > 0;
  const hasExport = (ops?.exportItems?.length ?? 0) > 0;
  const hasViewer = ops != null && ops.viewerUrl !== undefined;

  return (
    <>
      <Button
        size="small"
        endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 14 }} />}
        onClick={e => setAnchor(e.currentTarget)}
        sx={{ fontSize: 12, textTransform: 'none', color: 'text.secondary', px: 1, minWidth: 0, '&:hover': { color: 'text.primary' } }}
      >
        File
      </Button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        {ops?.currentName && (
          <Typography sx={{ px: 2, py: 0.5, fontSize: 11, color: 'text.disabled', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ops.currentName}
          </Typography>
        )}

        {!ops && (
          <MenuItem dense disabled>
            <ListItemText primary="No file actions for this view" />
          </MenuItem>
        )}

        {ops?.newDoc && (
          <MenuItem dense onClick={() => { close(); ops.newDoc!(); }}>
            <ListItemIcon><ArticleOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="New" />
          </MenuItem>
        )}

        {hasServer && <Divider />}
        {ops?.server?.map((it, i) => {
          const Icon = /save/i.test(it.label) ? CloudUploadOutlinedIcon : CloudDownloadOutlinedIcon;
          return (
            <MenuItem key={`srv-${i}`} dense disabled={it.disabled} onClick={() => { close(); it.run(); }}>
              <ListItemIcon><Icon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
              <ListItemText primary={it.label} secondary={it.secondary} />
            </MenuItem>
          );
        })}

        {hasImport && <Divider />}
        {renderItems(ops?.importItems, FolderOpenOutlinedIcon)}

        {hasExport && <Divider />}
        {renderItems(ops?.exportItems, DownloadOutlinedIcon)}

        {hasViewer && (
          <Fragment>
            <Divider />
            <MenuItem
              dense
              disabled={!ops!.viewerUrl}
              onClick={() => { close(); if (ops!.viewerUrl) window.open(ops!.viewerUrl, '_blank', 'noopener'); }}
            >
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Open in Viewer" secondary={ops!.viewerUrl ? undefined : 'Save the scene first'} />
            </MenuItem>
          </Fragment>
        )}
      </Menu>
    </>
  );
}
