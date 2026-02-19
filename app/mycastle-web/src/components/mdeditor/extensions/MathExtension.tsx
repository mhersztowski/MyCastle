import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { IconButton, Tooltip, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

// Inline Math Node View Component
const InlineMathNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.attrs.latex);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (containerRef.current && !isEditing) {
      try {
        katex.render(node.attrs.latex || 'x', containerRef.current, {
          throwOnError: false,
          displayMode: false,
        });
      } catch (e) {
        containerRef.current.innerHTML = `<span style="color: red;">${node.attrs.latex}</span>`;
      }
    }
  }, [node.attrs.latex, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditValue(node.attrs.latex);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue !== node.attrs.latex) {
      updateAttributes({ latex: editValue });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setEditValue(node.attrs.latex);
      setIsEditing(false);
    }
  };

  return (
    <NodeViewWrapper as="span" className="inline-math-wrapper">
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="inline-math-input"
          placeholder="LaTeX expression"
          style={{
            fontFamily: 'monospace',
            padding: '4px 8px',
            border: '2px solid #1976d2',
            borderRadius: '4px',
            outline: 'none',
            backgroundColor: '#fff',
            minWidth: '100px',
          }}
        />
      ) : (
        <Tooltip title="Kliknij aby edytować LaTeX" arrow placement="top">
          <span
            ref={containerRef}
            onClick={startEditing}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`inline-math ${selected ? 'selected' : ''}`}
            style={{
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: selected || isHovered ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.05)',
              border: selected ? '1px solid #1976d2' : '1px solid transparent',
              transition: 'all 0.2s ease',
            }}
          />
        </Tooltip>
      )}
    </NodeViewWrapper>
  );
};

// Block Math Node View Component
const MathBlockNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.attrs.latex);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (containerRef.current && !isEditing) {
      try {
        katex.render(node.attrs.latex || 'E = mc^2', containerRef.current, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (e) {
        containerRef.current.innerHTML = `<span style="color: red;">Błąd LaTeX: ${node.attrs.latex}</span>`;
      }
    }
  }, [node.attrs.latex, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditValue(node.attrs.latex);
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editValue !== node.attrs.latex) {
      updateAttributes({ latex: editValue });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(node.attrs.latex);
      setIsEditing(false);
    }
    // Ctrl+Enter to save
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <NodeViewWrapper className="math-block-wrapper">
      {isEditing ? (
        <Box
          sx={{
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            padding: '16px',
            margin: '8px 0',
            border: '2px solid #1976d2',
          }}
        >
          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1976d2' }}>
              Edycja LaTeX
            </span>
          </Box>
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="math-block-input"
            rows={4}
            placeholder="Wpisz wyrażenie LaTeX, np. \frac{a}{b}, \sum_{i=1}^n x_i"
            style={{
              width: '100%',
              fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              outline: 'none',
              resize: 'vertical',
              backgroundColor: 'white',
              fontSize: '14px',
              lineHeight: '1.5',
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <span style={{ fontSize: '12px', color: '#666' }}>
              Ctrl+Enter aby zapisać, Escape aby anulować
            </span>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <button
                onClick={() => {
                  setEditValue(node.attrs.latex);
                  setIsEditing(false);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Zapisz
              </button>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={{
            position: 'relative',
            textAlign: 'center',
            padding: '20px',
            margin: '8px 0',
            backgroundColor: selected || isHovered ? 'rgba(25, 118, 210, 0.05)' : '#fafafa',
            borderRadius: '8px',
            cursor: 'pointer',
            border: selected ? '2px solid #1976d2' : '1px solid #e0e0e0',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.08)',
              borderColor: '#1976d2',
            },
          }}
          onClick={startEditing}
        >
          {/* Edit button overlay */}
          {(isHovered || selected) && (
            <Tooltip title="Edytuj LaTeX" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  backgroundColor: '#1976d2',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#1565c0',
                  },
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <div ref={containerRef} className="math-block-content" />

          {/* Hint text */}
          {(isHovered || selected) && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 4,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '11px',
                color: '#666',
                backgroundColor: 'rgba(255,255,255,0.9)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              Kliknij aby edytować
            </Box>
          )}
        </Box>
      )}
    </NodeViewWrapper>
  );
};

// Inline Math Extension
export const InlineMath = Node.create({
  name: 'inlineMath',

  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: 'x',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          const latex = element.getAttribute('data-latex');
          return latex ? { latex: decodeURIComponent(latex) } : {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-type': 'inline-math',
      'data-latex': encodeURIComponent(node.attrs.latex || ''),
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathNodeView);
  },

  addCommands() {
    return {
      insertInlineMath: (latex = 'x') => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex },
        });
      },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\$([^$\s][^$]*[^$\s]?)\$$/,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
        }),
      }),
    ];
  },
});

// Block Math Extension
export const MathBlock = Node.create({
  name: 'mathBlock',

  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: 'E = mc^2',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          const latex = element.getAttribute('data-latex');
          return latex ? { latex: decodeURIComponent(latex) } : {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'math-block',
      'data-latex': encodeURIComponent(node.attrs.latex || ''),
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView);
  },

  addCommands() {
    return {
      insertMathBlock: (latex = 'E = mc^2') => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex },
        });
      },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /^\$\$(.+)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
        }),
      }),
    ];
  },
});

// Add type declarations for the commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      insertInlineMath: (latex?: string) => ReturnType;
    };
    mathBlock: {
      insertMathBlock: (latex?: string) => ReturnType;
    };
  }
}
