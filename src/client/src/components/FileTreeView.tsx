import React, { useState } from 'react';
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { DirectoryTree } from '../modules/mqttclient';

interface FileTreeViewProps {
  tree: DirectoryTree;
  onFileSelect: (path: string) => void;
}

interface TreeNodeProps {
  node: DirectoryTree;
  level: number;
  onFileSelect: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, level, onFileSelect }) => {
  const [open, setOpen] = useState(level === 0);

  const handleClick = () => {
    if (node.type === 'directory') {
      setOpen(!open);
    } else {
      onFileSelect(node.path);
    }
  };

  const isDirectory = node.type === 'directory';

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        sx={{ pl: 2 + level * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isDirectory ? (
            open ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />
          ) : (
            <InsertDriveFileIcon color="action" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={node.name}
          primaryTypographyProps={{
            variant: 'body2',
            noWrap: true,
          }}
        />
        {isDirectory && node.children && node.children.length > 0 && (
          open ? <ExpandLess /> : <ExpandMore />
        )}
      </ListItemButton>

      {isDirectory && node.children && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {node.children.map((child, index) => (
              <TreeNode
                key={`${child.path}-${index}`}
                node={child}
                level={level + 1}
                onFileSelect={onFileSelect}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const FileTreeView: React.FC<FileTreeViewProps> = ({ tree, onFileSelect }) => {
  return (
    <List component="nav" dense>
      <TreeNode node={tree} level={0} onFileSelect={onFileSelect} />
    </List>
  );
};

export default FileTreeView;
