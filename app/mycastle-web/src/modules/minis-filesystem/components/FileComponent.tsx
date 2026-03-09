import { ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { InsertDriveFile, Code, Description } from '@mui/icons-material';
import { FileNode } from '../nodes/FileNode';

interface FileComponentProps {
  file: FileNode;
  selected?: boolean;
  onClick?: (file: FileNode) => void;
}

function getFileIcon(extension: string) {
  switch (extension) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'json':
      return <Code />;
    case 'md':
    case 'txt':
      return <Description />;
    default:
      return <InsertDriveFile />;
  }
}

export function FileComponent({ file, selected = false, onClick }: FileComponentProps) {
  return (
    <ListItem disablePadding>
      <ListItemButton selected={selected} onClick={() => onClick?.(file)}>
        <ListItemIcon>{getFileIcon(file.extension)}</ListItemIcon>
        <ListItemText primary={file.name} secondary={`${file.size} bytes`} />
      </ListItemButton>
    </ListItem>
  );
}

export default FileComponent;
