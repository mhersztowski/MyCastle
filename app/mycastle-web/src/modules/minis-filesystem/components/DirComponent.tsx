import { List, ListItem, ListItemButton, ListItemIcon, ListItemText, Collapse } from '@mui/material';
import { Folder, FolderOpen, ExpandMore, ChevronRight } from '@mui/icons-material';
import { DirNode } from '../nodes/DirNode';
import { FileNode } from '../nodes/FileNode';
import { FileComponent } from './FileComponent';

interface DirComponentProps {
  dir: DirNode;
  level?: number;
  selectedFile?: FileNode | null;
  onFileSelect?: (file: FileNode) => void;
  onDirToggle?: (dir: DirNode) => void;
}

export function DirComponent({
  dir,
  level = 0,
  selectedFile,
  onFileSelect,
  onDirToggle,
}: DirComponentProps) {
  const handleClick = () => {
    dir.toggle();
    onDirToggle?.(dir);
  };

  return (
    <>
      <ListItem disablePadding sx={{ pl: level * 2 }}>
        <ListItemButton onClick={handleClick}>
          <ListItemIcon>
            {dir.expanded ? <ExpandMore /> : <ChevronRight />}
          </ListItemIcon>
          <ListItemIcon>
            {dir.expanded ? <FolderOpen /> : <Folder />}
          </ListItemIcon>
          <ListItemText primary={dir.name} />
        </ListItemButton>
      </ListItem>
      <Collapse in={dir.expanded} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {dir.dirs.map((subDir) => (
            <DirComponent
              key={subDir.path}
              dir={subDir}
              level={level + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              onDirToggle={onDirToggle}
            />
          ))}
          {dir.files.map((file) => (
            <ListItem key={file.path} disablePadding sx={{ pl: (level + 1) * 2 }}>
              <FileComponent
                file={file}
                selected={selectedFile?.path === file.path}
                onClick={onFileSelect}
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </>
  );
}

export default DirComponent;
