import React, { useCallback, useState } from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, IconButton } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export function getBlockId(el: HTMLElement): string | null {
  return (
    el.getAttribute('data-block-id') ||
    el.querySelector('[data-block-id]')?.getAttribute('data-block-id') ||
    null
  );
}

interface BlockActionMenuProps {
  viewportTop: number;
  viewportLeft: number;
  blockEl: HTMLElement;
  onMenuOpenChange: (open: boolean) => void;
}

export const BlockActionMenu: React.FC<BlockActionMenuProps> = ({
  viewportTop,
  viewportLeft,
  blockEl,
  onMenuOpenChange,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const openMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    onMenuOpenChange(true);
  }, [onMenuOpenChange]);

  const closeMenu = useCallback(() => {
    setMenuAnchor(null);
    onMenuOpenChange(false);
  }, [onMenuOpenChange]);

  const handleCopyId = useCallback(() => {
    const id = getBlockId(blockEl);
    if (id) navigator.clipboard.writeText(`#${id}`).catch(console.error);
    closeMenu();
  }, [blockEl, closeMenu]);

  const blockId = menuAnchor ? getBlockId(blockEl) : null;

  return (
    <>
      <IconButton
        size="small"
        onClick={openMenu}
        sx={{
          position: 'fixed',
          top: viewportTop,
          left: viewportLeft,
          width: 20,
          height: 20,
          opacity: 0.3,
          '&:hover': { opacity: 1, bgcolor: 'action.hover' },
          zIndex: 1200,
          pointerEvents: 'auto',
        }}
      >
        <MoreVertIcon sx={{ fontSize: 14 }} />
      </IconButton>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={handleCopyId} dense disabled={!blockId} title={blockId ?? undefined}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Copy Id"
            secondary={blockId ? blockId.slice(0, 8) + '…' : 'no id yet'}
          />
        </MenuItem>
      </Menu>
    </>
  );
};
