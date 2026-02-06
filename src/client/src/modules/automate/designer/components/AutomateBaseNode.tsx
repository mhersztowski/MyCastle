/**
 * AutomateBaseNode - custom ReactFlow node renderer
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Box, Paper, Typography } from '@mui/material';
import { NODE_TYPE_METADATA } from '../../registry/nodeTypes';
import { AutomateNodeType } from '../../models';
import { AutomatePortModel } from '../../models/AutomatePortModel';

// Custom comparator for memo - ensures outputs/inputs changes trigger re-render
const propsAreEqual = (prevProps: NodeProps, nextProps: NodeProps): boolean => {
  const prevData = prevProps.data as unknown as AutomateNodeData;
  const nextData = nextProps.data as unknown as AutomateNodeData;

  // Quick comparison of basic fields
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevData.name !== nextData.name) return false;
  if (prevData.disabled !== nextData.disabled) return false;
  if (prevData.isExecuting !== nextData.isExecuting) return false;
  if (prevData.hasError !== nextData.hasError) return false;
  if (prevData.isMobile !== nextData.isMobile) return false;
  if (prevData.script !== nextData.script) return false;
  if (prevData.nodeType !== nextData.nodeType) return false;

  // Deep comparison of outputs (important for switch node and error port)
  if (prevData.outputs?.length !== nextData.outputs?.length) return false;
  if (prevData.outputs && nextData.outputs) {
    for (let i = 0; i < prevData.outputs.length; i++) {
      if (prevData.outputs[i].id !== nextData.outputs[i].id) return false;
      if (prevData.outputs[i].name !== nextData.outputs[i].name) return false;
      if (prevData.outputs[i].dataType !== nextData.outputs[i].dataType) return false;
    }
  }

  // Deep comparison of inputs
  if (prevData.inputs?.length !== nextData.inputs?.length) return false;
  if (prevData.inputs && nextData.inputs) {
    for (let i = 0; i < prevData.inputs.length; i++) {
      if (prevData.inputs[i].id !== nextData.inputs[i].id) return false;
      if (prevData.inputs[i].name !== nextData.inputs[i].name) return false;
    }
  }

  // Compare config for preview rendering (comment, js_execute, call_flow)
  if (prevData.config.text !== nextData.config.text) return false;
  if (prevData.config.flowId !== nextData.config.flowId) return false;
  if (prevData.config.subflowName !== nextData.config.subflowName) return false;

  return true;
};

export interface AutomateNodeData {
  nodeType: AutomateNodeType;
  name: string;
  disabled?: boolean;
  inputs?: AutomatePortModel[];
  outputs?: AutomatePortModel[];
  config: Record<string, unknown>;
  script?: string;
  isExecuting?: boolean;
  hasError?: boolean;
  isMobile?: boolean;
}

const AutomateBaseNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as AutomateNodeData;
  const meta = NODE_TYPE_METADATA[nodeData.nodeType];
  if (!meta) return null;

  const Icon = meta.icon;
  const isDisabled = nodeData.disabled;
  const mobile = !!nodeData.isMobile;

  // Mobile-scaled dimensions
  const handleFlowSize = mobile ? 14 : 10;
  const handleDataSize = mobile ? 12 : 8;
  const iconSize = mobile ? 20 : 16;
  const portFontSize = mobile ? '0.75rem' : '0.65rem';
  const contentFontSize = mobile ? '0.7rem' : '0.6rem';
  const previewFontSize = mobile ? '0.7rem' : '0.65rem';
  const outlineWidth = mobile ? 3 : 2;

  // Touch target style for mobile handles
  const mobileHandleTouchTarget: React.CSSProperties = mobile ? {
    // Invisible expanded touch area via padding trick
  } : {};

  return (
    <Paper
      elevation={selected ? 4 : 1}
      sx={{
        minWidth: mobile ? 200 : 160,
        borderTop: `3px solid ${isDisabled ? '#bdbdbd' : meta.color}`,
        opacity: isDisabled ? 0.5 : 1,
        outline: nodeData.isExecuting ? `${outlineWidth}px solid ${meta.color}` : undefined,
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
          py: mobile ? 0.75 : 0.5,
          bgcolor: meta.color + '15',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Icon sx={{ fontSize: iconSize, color: meta.color }} />
        <Typography
          variant="caption"
          fontWeight={600}
          noWrap
          sx={{ flex: 1, fontSize: mobile ? '0.8rem' : undefined }}
        >
          {nodeData.name}
        </Typography>
      </Box>

      {/* Ports */}
      <Box sx={{ position: 'relative', minHeight: mobile ? 32 : 24, py: 0.5 }}>
        {/* Input ports */}
        {nodeData.inputs?.map((port) => (
          <Box key={port.id} sx={{ position: 'relative', pl: 2, pr: 1, py: mobile ? 0.5 : 0.25 }}>
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              style={{
                top: '50%',
                background: port.dataType === 'flow' ? '#555' : meta.color,
                width: port.dataType === 'flow' ? handleFlowSize : handleDataSize,
                height: port.dataType === 'flow' ? handleFlowSize : handleDataSize,
                borderRadius: port.dataType === 'flow' ? 2 : '50%',
                ...mobileHandleTouchTarget,
              }}
              className={mobile ? 'mobile-handle' : undefined}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: portFontSize }}>
              {port.name}
            </Typography>
          </Box>
        ))}

        {/* Output ports */}
        {nodeData.outputs?.map((port) => {
          const isErrorPort = port.dataType === 'error';
          const isFlowPort = port.dataType === 'flow';
          return (
            <Box
              key={port.id}
              sx={{
                position: 'relative',
                pr: 2,
                pl: 1,
                py: mobile ? 0.5 : 0.25,
                textAlign: 'right',
                bgcolor: isErrorPort ? '#ffebee' : undefined,
              }}
            >
              <Handle
                type="source"
                position={Position.Right}
                id={port.id}
                style={{
                  top: '50%',
                  background: isErrorPort ? '#f44336' : (isFlowPort ? '#555' : meta.color),
                  width: isFlowPort ? handleFlowSize : handleDataSize,
                  height: isFlowPort ? handleFlowSize : handleDataSize,
                  borderRadius: isFlowPort ? 2 : '50%',
                  border: isErrorPort ? '2px solid #b71c1c' : undefined,
                  ...mobileHandleTouchTarget,
                }}
                className={mobile ? 'mobile-handle' : undefined}
              />
              <Typography
                variant="caption"
                sx={{
                  fontSize: portFontSize,
                  color: isErrorPort ? 'error.main' : 'text.secondary',
                  fontWeight: isErrorPort ? 600 : undefined,
                }}
              >
                {port.name}
              </Typography>
            </Box>
          );
        })}

        {/* Node-specific content preview */}
        {nodeData.nodeType === 'comment' && !!nodeData.config.text && (
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: previewFontSize, fontStyle: 'italic' }}>
              {String(nodeData.config.text).substring(0, 50)}
            </Typography>
          </Box>
        )}

        {nodeData.nodeType === 'js_execute' && nodeData.script && (
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: contentFontSize, fontFamily: 'monospace', whiteSpace: 'pre', overflow: 'hidden', maxHeight: 32 }}
            >
              {nodeData.script.substring(0, 40)}...
            </Typography>
          </Box>
        )}

        {nodeData.nodeType === 'call_flow' && !!(nodeData.config.flowId as string) && (
          <Box sx={{ px: 1, py: 0.5, bgcolor: 'action.hover' }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: contentFontSize }}
            >
              → {(nodeData.config.subflowName as string) || (nodeData.config.flowId as string).substring(0, 8) + '...'}
            </Typography>
          </Box>
        )}

        {nodeData.hasError && (
          <Box sx={{ px: 1, py: 0.25, bgcolor: '#ffebee' }}>
            <Typography variant="caption" color="error" sx={{ fontSize: contentFontSize }}>
              Error
            </Typography>
          </Box>
        )}
      </Box>

      {/* Global mobile handle touch target styles */}
      {mobile && (
        <style>{`
          .mobile-handle::before {
            content: '';
            position: absolute;
            top: -20px;
            left: -20px;
            right: -20px;
            bottom: -20px;
          }
        `}</style>
      )}
    </Paper>
  );
};

export default memo(AutomateBaseNode, propsAreEqual);
