import React, { useCallback, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Box,
  IconButton,
  Divider,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  Button,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import LinkIcon from '@mui/icons-material/Link';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import HighlightIcon from '@mui/icons-material/Highlight';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import FunctionsIcon from '@mui/icons-material/Functions';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import TableSizePicker from './components/TableSizePicker';
import ColumnPicker from './components/ColumnPicker';
import EmojiPicker from './components/EmojiPicker';

interface MdEditorToolbarProps {
  editor: Editor;
  onSave?: () => void;
}

const MdEditorToolbar: React.FC<MdEditorToolbarProps> = ({ editor, onSave }) => {
  const [insertMenuAnchor, setInsertMenuAnchor] = useState<null | HTMLElement>(null);
  const insertMenuOpen = Boolean(insertMenuAnchor);

  const handleInsertMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setInsertMenuAnchor(event.currentTarget);
  };

  const handleInsertMenuClose = () => {
    setInsertMenuAnchor(null);
  };

  const insertComponent = useCallback((type: 'person' | 'task' | 'project') => {
    editor.chain().focus().insertComponentEmbed(type, '').run();
    handleInsertMenuClose();
  }, [editor]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    // Insert image with empty src - opens in edit mode
    editor.chain().focus().setImage({
      src: '',
      alt: '',
    }).run();
  }, [editor]);

  const addAudio = useCallback(() => {
    // Insert audio with empty src - opens in edit mode
    editor.chain().focus().setAudio({
      src: '',
    }).run();
  }, [editor]);

  const addVideo = useCallback(() => {
    // Insert video with empty src - opens in edit mode
    editor.chain().focus().setVideo({
      src: '',
    }).run();
  }, [editor]);

  const insertTable = useCallback((rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }, [editor]);

  const insertColumns = useCallback((columnCount: 2 | 3) => {
    editor.chain().focus().setColumns(columnCount).run();
  }, [editor]);

  const insertEmoji = useCallback((char: string) => {
    editor.chain().focus().insertContent(char).run();
  }, [editor]);

  const getHeadingLevel = (): string => {
    if (editor.isActive('heading', { level: 1 })) return '1';
    if (editor.isActive('heading', { level: 2 })) return '2';
    if (editor.isActive('heading', { level: 3 })) return '3';
    if (editor.isActive('heading', { level: 4 })) return '4';
    return '0';
  };

  const handleHeadingChange = (value: string) => {
    const level = parseInt(value);
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
        flexWrap: 'wrap',
        bgcolor: 'background.paper',
        flexShrink: 0, // Prevent toolbar from being compressed
        minHeight: 48, // Ensure minimum height
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Undo/Redo */}
      <Tooltip title="Undo (Ctrl+Z)">
        <IconButton size="small" onClick={() => editor.chain().focus().undo().run()}>
          <UndoIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Redo (Ctrl+Y)">
        <IconButton size="small" onClick={() => editor.chain().focus().redo().run()}>
          <RedoIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Heading selector */}
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <Select
          value={getHeadingLevel()}
          onChange={(e) => handleHeadingChange(e.target.value)}
          size="small"
          sx={{ height: 32 }}
        >
          <MenuItem value="0">Paragraph</MenuItem>
          <MenuItem value="1">Heading 1</MenuItem>
          <MenuItem value="2">Heading 2</MenuItem>
          <MenuItem value="3">Heading 3</MenuItem>
          <MenuItem value="4">Heading 4</MenuItem>
        </Select>
      </FormControl>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Text formatting */}
      <Tooltip title="Bold (Ctrl+B)">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
          color={editor.isActive('bold') ? 'primary' : 'default'}
        >
          <FormatBoldIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Italic (Ctrl+I)">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          color={editor.isActive('italic') ? 'primary' : 'default'}
        >
          <FormatItalicIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Strikethrough">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          color={editor.isActive('strike') ? 'primary' : 'default'}
        >
          <StrikethroughSIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Inline code">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleCode().run()}
          color={editor.isActive('code') ? 'primary' : 'default'}
        >
          <CodeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Highlight">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          color={editor.isActive('highlight') ? 'primary' : 'default'}
        >
          <HighlightIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Text Alignment */}
      <Tooltip title="Wyrównaj do lewej">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          color={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'default'}
        >
          <FormatAlignLeftIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Wyśrodkuj">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          color={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'default'}
        >
          <FormatAlignCenterIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Wyrównaj do prawej">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          color={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'default'}
        >
          <FormatAlignRightIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Wyjustuj">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          color={editor.isActive({ textAlign: 'justify' }) ? 'primary' : 'default'}
        >
          <FormatAlignJustifyIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Link & Media */}
      <Tooltip title="Link">
        <IconButton
          size="small"
          onClick={setLink}
          color={editor.isActive('link') ? 'primary' : 'default'}
        >
          <LinkIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Image">
        <IconButton size="small" onClick={addImage}>
          <ImageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Audio">
        <IconButton size="small" onClick={addAudio} color="secondary">
          <AudiotrackIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Video">
        <IconButton size="small" onClick={addVideo} color="error">
          <VideocamIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Lists */}
      <Tooltip title="Bullet list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          color={editor.isActive('bulletList') ? 'primary' : 'default'}
        >
          <FormatListBulletedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Numbered list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          color={editor.isActive('orderedList') ? 'primary' : 'default'}
        >
          <FormatListNumberedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Task list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          color={editor.isActive('taskList') ? 'primary' : 'default'}
        >
          <ChecklistIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Blocks */}
      <Tooltip title="Quote">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          color={editor.isActive('blockquote') ? 'primary' : 'default'}
        >
          <FormatQuoteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Code block">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          color={editor.isActive('codeBlock') ? 'primary' : 'default'}
        >
          <CodeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <TableSizePicker onSelect={insertTable} />
      <ColumnPicker onSelect={insertColumns} />
      <Tooltip title="Horizontal rule">
        <IconButton size="small" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <HorizontalRuleIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Math Block (LaTeX)">
        <IconButton size="small" onClick={() => editor.chain().focus().insertMathBlock('E = mc^2').run()}>
          <FunctionsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <EmojiPicker onSelect={insertEmoji} />

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Insert menu (for mobile - alternative to slash commands) */}
      <Tooltip title="Insert component">
        <IconButton size="small" onClick={handleInsertMenuOpen}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={insertMenuAnchor}
        open={insertMenuOpen}
        onClose={handleInsertMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={() => insertComponent('person')}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Person</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => insertComponent('task')}>
          <ListItemIcon>
            <TaskIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Task</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => insertComponent('project')}>
          <ListItemIcon>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Project</ListItemText>
        </MenuItem>
      </Menu>

      {/* Save button */}
      {onSave && (
        <>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={onSave}
          >
            Save
          </Button>
        </>
      )}
    </Box>
  );
};

export default MdEditorToolbar;
