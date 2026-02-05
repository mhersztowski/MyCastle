/**
 * AutomateBaseNode - custom ReactFlow node renderer
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Box, Paper, Typography } from '@mui/material';
import { NODE_TYPE_METADATA } from '../../registry/nodeTypes';
import { AutomateNodeType } from '../../models';
import { AutomatePortModel } from '../../models/AutomatePortModel';

interface AutomateNodeData {
  nodeType: AutomateNodeType;
  name: string;
  disabled?: boolean;
  inputs?: AutomatePortModel[];
  outputs?: AutomatePortModel[];
  config: Record<string, unknown>;
  script?: string;
  isExecuting?: boolean;
  hasError?: boolean;
}

const AutomateBaseNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as AutomateNodeData;
  const meta = NODE_TYPE_METADATA[nodeData.nodeType];
  if (!meta) return null;

  const Icon = meta.icon;
  const isDisabled = nodeData.disabled;

  return (
    <Paper
      elevation={selected ? 4 : 1}
      sx={{
        minWidth: 160,
        borderTop: `3px solid ${isDisabled ? '#bdbdbd' : meta.color}`,
        opacity: isDisabled ? 0.5 : 1,
        outline: nodeData.isExecuting ? `2px solid ${meta.color}` : undefined,
        outlineOffset: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          bgcolor: meta.color + '15',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Icon sx={{ fontSize: 16, color: meta.color }} />
        <Typography variant="caption" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {nodeData.name}
        </Typography>
      </Box>

      {/* Ports */}
      <Box sx={{ position: 'relative', minHeight: 24, py: 0.5 }}>
        {/* Input ports */}
        {nodeData.inputs?.map((port) => (
          <Box key={port.id} sx={{ position: 'relative', pl: 2, pr: 1, py: 0.25 }}>
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              style={{
                top: '50%',
                background: port.dataType === 'flow' ? '#555' : meta.color,
                width: port.dataType === 'flow' ? 10 : 8,
                height: port.dataType === 'flow' ? 10 : 8,
                borderRadius: port.dataType === 'flow' ? 2 : '50%',
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {port.name}
            </Typography>
          </Box>
        ))}

        {/* Output ports */}
        {nodeData.outputs?.map((port) => (
          <Box key={port.id} sx={{ position: 'relative', pr: 2, pl: 1, py: 0.25, textAlign: 'right' }}>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              style={{
                top: '50%',
                background: port.dataType === 'flow' ? '#555' : meta.color,
                width: port.dataType === 'flow' ? 10 : 8,
                height: port.dataType === 'flow' ? 10 : 8,
                borderRadius: port.dataType === 'flow' ? 2 : '50%',
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {port.name}
            </Typography>
          </Box>
        ))}

        {/* Node-specific content preview */}
        {nodeData.nodeType === 'comment' && !!nodeData.config.text && (
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontStyle: 'italic' }}>
              {String(nodeData.config.text).substring(0, 50)}
            </Typography>
          </Box>
        )}

        {nodeData.nodeType === 'js_execute' && nodeData.script && (
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.6rem', fontFamily: 'monospace', whiteSpace: 'pre', overflow: 'hidden', maxHeight: 32 }}
            >
              {nodeData.script.substring(0, 40)}...
            </Typography>
          </Box>
        )}

        {nodeData.hasError && (
          <Box sx={{ px: 1, py: 0.25, bgcolor: '#ffebee' }}>
            <Typography variant="caption" color="error" sx={{ fontSize: '0.6rem' }}>
              Error
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default memo(AutomateBaseNode);
