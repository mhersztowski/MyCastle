import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

import { MarkdownOutput, ReactiveValue, ScriptOutput, TableOutput } from './types';

function looksLikeMarkdown(str: string): boolean {
  return /^#{1,6}\s|\*\*[^*]+\*\*|^[-*+]\s|^\d+\.\s|`[^`]+`/.test(str.trimStart());
}

// ─── Reactive live block ──────────────────────────────────────────────────────

const ReactiveRenderer: React.FC<{ value: ReactiveValue }> = ({ value }) => {
  const [current, setCurrent] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (value.config.initial) {
        try {
          const v = await value.config.initial();
          if (!cancelled) { setCurrent(v); setLoading(false); }
        } catch {
          if (!cancelled) setLoading(false);
        }
      } else {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    const unsub = value.config.subscribe((v) => {
      if (!cancelled) { setCurrent(v); setLoading(false); }
    });

    return () => { cancelled = true; unsub(); };
  }, [value]);

  const rendered = current !== undefined ? value.config.render(current) : null;

  return (
    <Box sx={{ p: 1 }}>
      <Chip
        icon={<FiberManualRecordIcon sx={{ fontSize: 8, color: '#4caf50 !important' }} />}
        label="LIVE"
        size="small"
        sx={{ mb: 0.5, height: 18, fontSize: '0.6rem', bgcolor: 'rgba(76,175,80,0.1)', color: '#4caf50', border: '1px solid rgba(76,175,80,0.3)' }}
      />
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
          <HourglassEmptyIcon sx={{ fontSize: 14 }} />
          <Typography variant="caption">Waiting for data...</Typography>
        </Box>
      ) : (
        typeof rendered === 'string'
          ? (looksLikeMarkdown(rendered)
              ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered}</ReactMarkdown>
              : <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{rendered}</Typography>)
          : rendered
      )}
    </Box>
  );
};

// ─── Table renderer ───────────────────────────────────────────────────────────

const TableRenderer: React.FC<{ output: TableOutput }> = ({ output }) => {
  const { data, columns } = output;
  if (!Array.isArray(data) || data.length === 0) return null;

  const isObj = typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]);
  const headers = columns ?? (isObj ? Object.keys(data[0] as Record<string, unknown>) : (data[0] as unknown[]).map((_, i) => String(i)));

  return (
    <Box sx={{ overflow: 'auto', p: 1 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {headers.map((h, i) => (
              <TableCell key={i} sx={{ fontWeight: 600, fontSize: '0.75rem', py: 0.5 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, ri) => (
            <TableRow key={ri}>
              {isObj
                ? headers.map((h, hi) => (
                    <TableCell key={hi} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                      {String((row as Record<string, unknown>)[h] ?? '')}
                    </TableCell>
                  ))
                : (row as unknown[]).map((cell, ci) => (
                    <TableCell key={ci} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                      {String(cell ?? '')}
                    </TableCell>
                  ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

// ─── Main renderer ────────────────────────────────────────────────────────────

export const OutputRenderer: React.FC<{ output: ScriptOutput }> = ({ output }) => {
  if (output === null || output === undefined) return null;

  if (output instanceof ReactiveValue) {
    return <ReactiveRenderer value={output} />;
  }

  if (output instanceof TableOutput) {
    return <TableRenderer output={output} />;
  }

  if (output instanceof MarkdownOutput) {
    return (
      <Box sx={{ p: 1, '& p:last-child': { mb: 0 } }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{output.content}</ReactMarkdown>
      </Box>
    );
  }

  if (React.isValidElement(output)) {
    return <Box sx={{ p: 1 }}>{output}</Box>;
  }

  if (typeof output === 'string') {
    if (looksLikeMarkdown(output)) {
      return (
        <Box sx={{ p: 1, '& p:last-child': { mb: 0 } }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
        </Box>
      );
    }
    return (
      <Typography variant="body2" sx={{ p: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {output}
      </Typography>
    );
  }

  // Fallback: JSON dump
  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
        {JSON.stringify(output, null, 2)}
      </Typography>
    </Box>
  );
};
