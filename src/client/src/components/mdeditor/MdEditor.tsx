import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow } from '@tiptap/extension-table';
import { CustomTableCell } from './extensions/CustomTableCell';
import { CustomTableHeader } from './extensions/CustomTableHeader';
import { common, createLowlight } from 'lowlight';
import { Box, IconButton, Paper, Divider, Popper, TextField, Tooltip, Fab, Collapse, useMediaQuery, useTheme } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import HighlightIcon from '@mui/icons-material/Highlight';

import MdEditorToolbar from './MdEditorToolbar';
import SlashCommands from './extensions/SlashCommands';
import { InlineMath, MathBlock } from './extensions/MathExtension';
import { EditableImage } from './extensions/ImageExtension';
import { AudioEmbed } from './extensions/AudioExtension';
import { VideoEmbed } from './extensions/VideoExtension';
import { ComponentEmbed } from './extensions/ComponentEmbedExtension';
import { ColumnLayout, Column } from './extensions/ColumnExtension';
import { UIFormEmbed } from './extensions/UIFormExtension';
import { markdownToHtml, htmlToMarkdown } from './utils/markdownConverter';
import 'katex/dist/katex.min.css';
import './MdEditor.css';

const lowlight = createLowlight(common);

export interface MdEditorProps {
  initialContent?: string;
  onSave?: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
}

const MdEditor: React.FC<MdEditorProps> = ({
  initialContent = '',
  onSave,
  placeholder = 'Type \'/\' for commands...',
  editable = true,
  autoFocus = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const initialContentRef = useRef(initialContent);
  const isInitializedRef = useRef(false);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const [bubbleMenuAnchor, setBubbleMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);

  // Toolbar visibility for mobile
  const [toolbarVisible, setToolbarVisible] = useState(!isMobile);
  const lastScrollTop = useRef(0);

  // Link editing state
  const [linkPopupAnchor, setLinkPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [hoveredLinkElement, setHoveredLinkElement] = useState<HTMLElement | null>(null);
  const linkHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const linkHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store link position for editing
  const linkPositionRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'md-editor-link',
        },
      }),
      EditableImage,
      TaskList.configure({
        HTMLAttributes: {
          class: 'md-editor-task-list',
        },
      }),
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Typography,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'md-editor-code-block',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'md-editor-table',
        },
      }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      SlashCommands,
      InlineMath,
      MathBlock,
      ComponentEmbed,
      AudioEmbed,
      VideoEmbed,
      ColumnLayout,
      Column,
      UIFormEmbed,
    ],
    content: '',
    editable,
    autofocus: autoFocus ? 'start' : false,
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      if (hasSelection) {
        // Get selection coordinates
        const { view } = editor;
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);

        setBubbleMenuAnchor({
          x: (start.left + end.left) / 2,
          y: start.top - 10,
        });
        setShowBubbleMenu(true);
        setShowLinkPopup(false);
      } else {
        setShowBubbleMenu(false);
      }
    },
    onBlur: () => {
      // Delay hiding to allow clicking on bubble menu or link popup
      setTimeout(() => {
        if (!document.activeElement?.closest('.md-editor-bubble-menu') &&
            !document.activeElement?.closest('.md-editor-link-popup')) {
          setShowBubbleMenu(false);
          setShowLinkPopup(false);
        }
      }, 150);
    },
  });

  // Load initial content only once when editor is ready
  useEffect(() => {
    if (editor && !isInitializedRef.current && initialContentRef.current) {
      const html = markdownToHtml(initialContentRef.current);
      editor.commands.setContent(html);
      // Set cursor to the beginning and scroll to top after DOM update
      setTimeout(() => {
        editor.commands.focus('start');
        if (contentWrapperRef.current) {
          contentWrapperRef.current.scrollTop = 0;
        }
      }, 100);
      isInitializedRef.current = true;
    }
  }, [editor]);

  // Update initial content ref when prop changes (for external reloads)
  useEffect(() => {
    if (initialContent !== initialContentRef.current) {
      initialContentRef.current = initialContent;
      if (editor && initialContent) {
        const html = markdownToHtml(initialContent);
        editor.commands.setContent(html);
        // Set cursor to the beginning and scroll to top after DOM update
        setTimeout(() => {
          editor.commands.focus('start');
          if (contentWrapperRef.current) {
            contentWrapperRef.current.scrollTop = 0;
          }
        }, 100);
      }
    }
  }, [initialContent, editor]);

  const handleSave = useCallback(() => {
    if (editor && onSave) {
      const html = editor.getHTML();
      console.log('MdEditor handleSave - HTML:', html);
      const markdown = htmlToMarkdown(html);
      console.log('MdEditor handleSave - Markdown:', markdown);
      onSave(markdown);
    }
  }, [editor, onSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const handleLinkUrlChange = useCallback((newUrl: string) => {
    setLinkUrl(newUrl);
  }, []);

  const handleLinkUrlSubmit = useCallback(() => {
    if (!editor) return;

    // Use stored position to select the link
    if (linkPositionRef.current) {
      const { from, to } = linkPositionRef.current;
      editor.chain().focus().setTextSelection({ from, to }).run();
    }

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setShowLinkPopup(false);
    linkPositionRef.current = null;
  }, [editor, linkUrl]);

  const handleRemoveLink = useCallback(() => {
    if (!editor) return;

    // Use stored position to select the link
    if (linkPositionRef.current) {
      const { from, to } = linkPositionRef.current;
      editor.chain().focus().setTextSelection({ from, to }).run();
    }

    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setShowLinkPopup(false);
    linkPositionRef.current = null;
  }, [editor]);

  const handleOpenLink = useCallback(() => {
    if (!linkUrl) return;

    // Check if it's a relative/internal link (not http/https/mailto)
    const isExternal = linkUrl.startsWith('http://') ||
                       linkUrl.startsWith('https://') ||
                       linkUrl.startsWith('mailto:');

    if (isExternal) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Internal link - open in editor
      // Remove leading slash if present for path
      let path = linkUrl;
      if (path.startsWith('/')) {
        path = path.substring(1);
      }
      // Determine file type and open appropriate editor
      const editorUrl = `/editor/simple/${path}`;
      window.open(editorUrl, '_blank', 'noopener,noreferrer');
    }
  }, [linkUrl]);

  // Handle mouse over links - show popup after delay
  const handleEditorMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Match any <a> element inside ProseMirror editor
    const linkElement = target.closest('.ProseMirror a') as HTMLAnchorElement | null;

    if (linkElement && linkElement.hasAttribute('href') && editor) {
      // Cancel any pending hide timeout when returning to a link
      if (linkHideTimeoutRef.current) {
        clearTimeout(linkHideTimeoutRef.current);
        linkHideTimeoutRef.current = null;
      }

      if (linkElement !== hoveredLinkElement) {
        // Clear any existing show timeout
        if (linkHoverTimeoutRef.current) {
          clearTimeout(linkHoverTimeoutRef.current);
        }

        setHoveredLinkElement(linkElement);

        // Show popup after delay (500ms)
        linkHoverTimeoutRef.current = setTimeout(() => {
          const rect = linkElement.getBoundingClientRect();
          const href = linkElement.getAttribute('href') || '';

          // Store the link's position in the document for later editing
          try {
            const view = editor.view;
            const pos = view.posAtDOM(linkElement, 0);
            // Find the full extent of the link mark
            const $pos = view.state.doc.resolve(pos);
            const linkMark = $pos.marks().find(m => m.type.name === 'link');
            if (linkMark) {
              // Find start and end of the link
              let from = pos;
              let to = pos;

              // Search backwards for link start
              while (from > 0) {
                const $from = view.state.doc.resolve(from - 1);
                if (!$from.marks().some(m => m.type.name === 'link' && m.attrs.href === linkMark.attrs.href)) {
                  break;
                }
                from--;
              }

              // Search forwards for link end
              while (to < view.state.doc.content.size) {
                const $to = view.state.doc.resolve(to);
                if (!$to.marks().some(m => m.type.name === 'link' && m.attrs.href === linkMark.attrs.href)) {
                  break;
                }
                to++;
              }

              linkPositionRef.current = { from, to };
            }
          } catch (err) {
            console.warn('Could not determine link position:', err);
            linkPositionRef.current = null;
          }

          setLinkPopupAnchor({
            x: rect.left,
            y: rect.bottom + 5,
          });
          setLinkUrl(href);
          setShowLinkPopup(true);
        }, 500);
      }
    }
  }, [hoveredLinkElement, editor]);

  const handleEditorMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement | null;

    // Check if we're leaving a link element
    const linkElement = target.closest('.ProseMirror a');
    if (linkElement) {
      // Check if we're moving to the popup or another part of the same link
      const isMovingToPopup = relatedTarget?.closest('.md-editor-link-popup');
      const isMovingToSameLink = relatedTarget?.closest('.ProseMirror a') === linkElement;

      if (!isMovingToPopup && !isMovingToSameLink) {
        // Clear show timeout if we leave before delay
        if (linkHoverTimeoutRef.current) {
          clearTimeout(linkHoverTimeoutRef.current);
          linkHoverTimeoutRef.current = null;
        }

        // Add delay before hiding to allow moving to popup
        if (linkHideTimeoutRef.current) {
          clearTimeout(linkHideTimeoutRef.current);
        }
        linkHideTimeoutRef.current = setTimeout(() => {
          setHoveredLinkElement(null);
          setShowLinkPopup(false);
        }, 150);
      }
    }
  }, []);

  const handleLinkPopupMouseEnter = useCallback(() => {
    // Cancel any pending hide timeout
    if (linkHideTimeoutRef.current) {
      clearTimeout(linkHideTimeoutRef.current);
      linkHideTimeoutRef.current = null;
    }
    // Also cancel show timeout
    if (linkHoverTimeoutRef.current) {
      clearTimeout(linkHoverTimeoutRef.current);
      linkHoverTimeoutRef.current = null;
    }
  }, []);

  const handleLinkPopupMouseLeave = useCallback(() => {
    // Add small delay before hiding when leaving popup
    if (linkHideTimeoutRef.current) {
      clearTimeout(linkHideTimeoutRef.current);
    }
    linkHideTimeoutRef.current = setTimeout(() => {
      setShowLinkPopup(false);
      setHoveredLinkElement(null);
    }, 150);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (linkHoverTimeoutRef.current) {
        clearTimeout(linkHoverTimeoutRef.current);
      }
      if (linkHideTimeoutRef.current) {
        clearTimeout(linkHideTimeoutRef.current);
      }
    };
  }, []);

  // Handle scroll to auto-hide toolbar on mobile
  const handleScroll = useCallback(() => {
    if (!isMobile || !contentWrapperRef.current) return;

    const scrollTop = contentWrapperRef.current.scrollTop;
    const scrollDelta = scrollTop - lastScrollTop.current;

    // Hide toolbar when scrolling down, show when scrolling up
    if (scrollDelta > 10 && toolbarVisible) {
      setToolbarVisible(false);
    } else if (scrollDelta < -10 && !toolbarVisible) {
      setToolbarVisible(true);
    }

    lastScrollTop.current = scrollTop;
  }, [isMobile, toolbarVisible]);

  // Update toolbar visibility when switching between mobile/desktop
  useEffect(() => {
    setToolbarVisible(!isMobile);
  }, [isMobile]);

  if (!editor) {
    return null;
  }

  return (
    <Box className="md-editor-container" sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Collapsible toolbar for mobile */}
      <Collapse in={toolbarVisible} timeout={200}>
        <MdEditorToolbar editor={editor} onSave={handleSave} />
      </Collapse>

      {/* FAB to show toolbar when hidden on mobile */}
      {isMobile && !toolbarVisible && (
        <Fab
          size="small"
          color="primary"
          onClick={() => setToolbarVisible(true)}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 20,
          }}
        >
          <EditIcon />
        </Fab>
      )}

      {/* Close button when toolbar is visible on mobile */}
      {isMobile && toolbarVisible && (
        <IconButton
          size="small"
          onClick={() => setToolbarVisible(false)}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 20,
            bgcolor: 'background.paper',
            boxShadow: 1,
            '&:hover': { bgcolor: 'grey.100' },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}

      {/* Bubble Menu - appears on text selection */}
      <Popper
        open={showBubbleMenu && bubbleMenuAnchor !== null}
        anchorEl={
          bubbleMenuAnchor
            ? {
                getBoundingClientRect: () => ({
                  top: bubbleMenuAnchor.y,
                  left: bubbleMenuAnchor.x,
                  bottom: bubbleMenuAnchor.y,
                  right: bubbleMenuAnchor.x,
                  width: 0,
                  height: 0,
                  x: bubbleMenuAnchor.x,
                  y: bubbleMenuAnchor.y,
                  toJSON: () => ({}),
                }),
              }
            : null
        }
        placement="top"
        sx={{ zIndex: 1300 }}
      >
        <Paper
          elevation={4}
          className="md-editor-bubble-menu"
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 0.5,
            borderRadius: 1,
            gap: 0.25,
          }}
        >
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleBold().run()}
            color={editor.isActive('bold') ? 'primary' : 'default'}
          >
            <FormatBoldIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            color={editor.isActive('italic') ? 'primary' : 'default'}
          >
            <FormatItalicIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            color={editor.isActive('strike') ? 'primary' : 'default'}
          >
            <StrikethroughSIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleCode().run()}
            color={editor.isActive('code') ? 'primary' : 'default'}
          >
            <CodeIcon fontSize="small" />
          </IconButton>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <IconButton
            size="small"
            onClick={setLink}
            color={editor.isActive('link') ? 'primary' : 'default'}
          >
            <LinkIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            color={editor.isActive('highlight') ? 'primary' : 'default'}
          >
            <HighlightIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Popper>

      {/* Link Edit Popup - appears when cursor is on a link */}
      <Popper
        open={showLinkPopup && linkPopupAnchor !== null}
        anchorEl={
          linkPopupAnchor
            ? {
                getBoundingClientRect: () => ({
                  top: linkPopupAnchor.y,
                  left: linkPopupAnchor.x,
                  bottom: linkPopupAnchor.y,
                  right: linkPopupAnchor.x,
                  width: 0,
                  height: 0,
                  x: linkPopupAnchor.x,
                  y: linkPopupAnchor.y,
                  toJSON: () => ({}),
                }),
              }
            : null
        }
        placement="bottom-start"
        sx={{ zIndex: 1300 }}
      >
        <Paper
          elevation={4}
          className="md-editor-link-popup"
          onMouseEnter={handleLinkPopupMouseEnter}
          onMouseLeave={handleLinkPopupMouseLeave}
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 1,
            borderRadius: 1,
            gap: 0.5,
          }}
        >
          <TextField
            size="small"
            value={linkUrl}
            onChange={(e) => handleLinkUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLinkUrlSubmit();
              }
              if (e.key === 'Escape') {
                setShowLinkPopup(false);
                setHoveredLinkElement(null);
              }
            }}
            placeholder="https://"
            sx={{
              minWidth: 250,
              '& .MuiInputBase-input': {
                fontSize: '0.875rem',
              }
            }}
          />
          <Tooltip title={
            linkUrl && !linkUrl.startsWith('http://') && !linkUrl.startsWith('https://') && !linkUrl.startsWith('mailto:')
              ? "Otwórz w edytorze"
              : "Otwórz link"
          }>
            <IconButton
              size="small"
              onClick={handleOpenLink}
              disabled={!linkUrl}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Usuń link">
            <IconButton
              size="small"
              onClick={handleRemoveLink}
              color="error"
            >
              <LinkOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
      </Popper>

      <Box
        ref={contentWrapperRef}
        className="md-editor-content-wrapper"
        onMouseOver={handleEditorMouseOver}
        onMouseOut={handleEditorMouseOut}
        onScroll={handleScroll}
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          p: 2,
          '& .ProseMirror': {
            outline: 'none',
            minHeight: '100%',
          },
        }}
      >
        <EditorContent editor={editor} className="md-editor-content" />
      </Box>
    </Box>
  );
};

export default MdEditor;
