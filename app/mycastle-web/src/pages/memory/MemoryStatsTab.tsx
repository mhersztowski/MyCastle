/**
 * Memory page — Statistics tab.
 *
 * Two views:
 *   1. Per-question stats — every question with askedCount, correct%, last asked
 *      (filterable by category)
 *   2. Session history — every session with date, duration, correct ratio,
 *      categories, expandable to show each answer
 */

import React, { useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Chip, Collapse, Divider, IconButton,
  LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MemoryData } from './types';

interface Props {
  data: MemoryData;
  onUpdate: (next: MemoryData) => void;
}

const ALL = '__all__';

export default function MemoryStatsTab({ data, onUpdate }: Props): React.JSX.Element {
  const [catFilter, setCatFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filteredQs = useMemo(() => {
    const qs = catFilter === ALL ? data.questions : data.questions.filter((q) => q.categoryId === catFilter);
    // Sort by askedCount desc, then correct% asc (worst-performing surface first)
    return [...qs].sort((a, b) => {
      if (a.stats.askedCount !== b.stats.askedCount) return b.stats.askedCount - a.stats.askedCount;
      const ra = a.stats.askedCount > 0 ? a.stats.correctCount / a.stats.askedCount : 1;
      const rb = b.stats.askedCount > 0 ? b.stats.correctCount / b.stats.askedCount : 1;
      return ra - rb;
    });
  }, [data.questions, catFilter]);

  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '(deleted)';

  // ── Roll-up totals across the filtered set ────────────────────────────────
  const totals = useMemo(() => {
    const totalAsked = filteredQs.reduce((s, q) => s + q.stats.askedCount, 0);
    const totalCorrect = filteredQs.reduce((s, q) => s + q.stats.correctCount, 0);
    return {
      questions: filteredQs.length,
      everAsked: filteredQs.filter((q) => q.stats.askedCount > 0).length,
      totalAsked,
      totalCorrect,
      ratio: totalAsked > 0 ? totalCorrect / totalAsked : 0,
    };
  }, [filteredQs]);

  // ── Sessions ──────────────────────────────────────────────────────────────
  const sessions = useMemo(() => {
    return [...data.sessions].sort((a, b) => b.startedAt - a.startedAt);
  }, [data.sessions]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSession = (id: string) => {
    if (!confirm('Delete this session and its answers?')) return;
    onUpdate({ ...data, sessions: data.sessions.filter((s) => s.id !== id) });
  };

  const fmtDuration = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), rem = s % 60;
    return `${m} min ${rem} s`;
  };

  const fmtDate = (ms: number) => new Date(ms).toLocaleString();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Per-question stats */}
      <Box>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Question stats</Typography>
          <Box sx={{ flex: 1 }} />
          <TextField select size="small" label="Category"
            value={catFilter} onChange={(e) => setCatFilter(e.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value={ALL}>All categories</MenuItem>
            {data.categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
        </Stack>

        {/* Totals row */}
        <Paper sx={{ p: 1.5, mb: 1, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Stat label="Questions" value={totals.questions} />
          <Stat label="Ever asked" value={`${totals.everAsked} / ${totals.questions}`} />
          <Stat label="Total answers" value={totals.totalAsked} />
          <Stat label="Correct answers" value={totals.totalCorrect} />
          <Stat label="Overall accuracy" value={totals.totalAsked > 0 ? `${(100 * totals.ratio).toFixed(1)} %` : '—'} />
        </Paper>

        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Question</TableCell>
                <TableCell sx={{ width: 120 }}>Category</TableCell>
                <TableCell sx={{ width: 60 }}>Type</TableCell>
                <TableCell sx={{ width: 80 }} align="right">Asked</TableCell>
                <TableCell sx={{ width: 150 }}>Accuracy</TableCell>
                <TableCell sx={{ width: 150 }}>Last asked</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredQs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}><Typography color="text.secondary" sx={{ p: 1 }}>No questions yet.</Typography></TableCell>
                </TableRow>
              )}
              {filteredQs.map((q) => {
                const asked = q.stats.askedCount;
                const correct = q.stats.correctCount;
                const pct = asked > 0 ? Math.round(100 * correct / asked) : 0;
                const colour = !asked ? 'inherit' : pct >= 80 ? 'success.main' : pct >= 50 ? 'warning.main' : 'error.main';
                return (
                  <TableRow key={q.id} hover>
                    <TableCell sx={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={q.questionMarkdown.slice(0, 300)}>
                        <span>{q.questionMarkdown.slice(0, 120)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell><Chip size="small" label={catName(q.categoryId)} /></TableCell>
                    <TableCell>{q.type}</TableCell>
                    <TableCell align="right">{asked}</TableCell>
                    <TableCell>
                      {asked === 0 ? (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      ) : (
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <LinearProgress
                            variant="determinate" value={pct}
                            sx={{
                              flex: 1, height: 6, borderRadius: 1,
                              '& .MuiLinearProgress-bar': { bgcolor: colour },
                            }}
                          />
                          <Typography variant="caption" sx={{ color: colour, minWidth: 40, textAlign: 'right' }}>
                            {pct}%
                          </Typography>
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {q.stats.lastAskedAt ? fmtDate(q.stats.lastAskedAt) : '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      <Divider />

      {/* Session history */}
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Sessions ({sessions.length})</Typography>
        {sessions.length === 0 && (
          <Paper sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            No completed sessions yet — finish a test to see it here.
          </Paper>
        )}
        <Stack spacing={1}>
          {sessions.map((s) => {
            const isOpen = expanded.has(s.id);
            const correct = s.answers.filter((a) => a.correct).length;
            const total = s.answers.length;
            const duration = (s.endedAt ?? Date.now()) - s.startedAt;
            const cats = s.categoryIds.map(catName).join(', ');
            return (
              <Card key={s.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton size="small" onClick={() => toggleExpanded(s.id)}>
                      {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2"><strong>{fmtDate(s.startedAt)}</strong> · {cats || '(no categories)'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Duration {fmtDuration(duration)} · {correct}/{total} correct ({total > 0 ? `${Math.round(100 * correct / total)}%` : '—'})
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => deleteSession(s.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                  <Collapse in={isOpen} unmountOnExit>
                    <Table size="small" sx={{ mt: 1 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Question</TableCell>
                          <TableCell sx={{ width: 200 }}>Your answer</TableCell>
                          <TableCell sx={{ width: 80 }}>Result</TableCell>
                          <TableCell sx={{ width: 80 }}>Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {s.answers.map((a, i) => {
                          const q = data.questions.find((x) => x.id === a.questionId);
                          return (
                            <TableRow key={i}>
                              <TableCell sx={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <Tooltip title={q?.questionMarkdown ?? '(deleted question)'}>
                                  <span>{q?.questionMarkdown.slice(0, 80) ?? '(deleted)'}</span>
                                </Tooltip>
                              </TableCell>
                              <TableCell sx={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <Tooltip title={a.aiVerdict ?? a.userAnswer}>
                                  <span>{a.userAnswer}</span>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                <Chip size="small" color={a.correct ? 'success' : 'error'}
                                  label={a.correct ? '✓' : '✗'} />
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary">
                                  {fmtDuration(a.answeredAt - a.askedAt)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6">{value}</Typography>
    </Box>
  );
}
