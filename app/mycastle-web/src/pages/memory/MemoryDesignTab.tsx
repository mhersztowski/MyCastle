/**
 * Memory page — Design tab.
 *
 * Manage categories + questions:
 *  - Categories list on the left, click to filter questions on the right
 *  - Add / edit / delete questions (text or choice)
 *  - AI buttons:
 *      • "Generate 1 with AI" — opus generates a single Q+A for the selected category
 *      • "Generate N with AI"  — opus analyses existing questions and adds N new
 *      • "Find image" per question — Wikipedia search to enrich the markdown
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, List, ListItemButton, ListItemText,
  MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import { v4 as uuid } from 'uuid';
import {
  aiGenerateQuestion, aiGenerateBatch, findImage,
} from './MemoryService';
import type {
  MemoryCategory, MemoryChoice, MemoryData, MemoryQuestion, QuestionType,
} from './types';

interface Props {
  data: MemoryData;
  userName: string;
  /** Persist a mutated copy of `data` (rebuild via spread-rest in caller). */
  onUpdate: (next: MemoryData) => void;
}

const EMPTY_STATS = { askedCount: 0, correctCount: 0 } as const;

export default function MemoryDesignTab({ data, userName, onUpdate }: Props): React.JSX.Element {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemoryQuestion | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [batchCount, setBatchCount] = useState(5);
  const [aiBusy, setAiBusy] = useState<null | 'one' | 'batch' | string>(null);
  const [error, setError] = useState<string | null>(null);

  const questions = useMemo(() => {
    if (!selectedCat) return [];
    return data.questions.filter((q) => q.categoryId === selectedCat);
  }, [data.questions, selectedCat]);

  // ── Category CRUD ──────────────────────────────────────────────────────────

  const addCategory = useCallback(() => {
    if (!newCatName.trim()) return;
    const cat: MemoryCategory = {
      id: uuid(),
      name: newCatName.trim(),
      description: newCatDesc.trim() || undefined,
      createdAt: Date.now(),
    };
    onUpdate({ ...data, categories: [...data.categories, cat] });
    setSelectedCat(cat.id);
    setNewCatName('');
    setNewCatDesc('');
    setNewCatOpen(false);
  }, [data, newCatName, newCatDesc, onUpdate]);

  const deleteCategory = useCallback((id: string) => {
    if (!confirm('Delete this category and all of its questions?')) return;
    onUpdate({
      ...data,
      categories: data.categories.filter((c) => c.id !== id),
      questions: data.questions.filter((q) => q.categoryId !== id),
    });
    if (selectedCat === id) setSelectedCat(null);
  }, [data, onUpdate, selectedCat]);

  // ── Question CRUD ──────────────────────────────────────────────────────────

  const saveQuestion = useCallback((q: MemoryQuestion) => {
    const exists = data.questions.some((x) => x.id === q.id);
    const updatedQ = { ...q, updatedAt: Date.now() };
    onUpdate({
      ...data,
      questions: exists
        ? data.questions.map((x) => (x.id === q.id ? updatedQ : x))
        : [...data.questions, updatedQ],
    });
    setEditing(null);
  }, [data, onUpdate]);

  const deleteQuestion = useCallback((id: string) => {
    if (!confirm('Delete this question?')) return;
    onUpdate({ ...data, questions: data.questions.filter((q) => q.id !== id) });
  }, [data, onUpdate]);

  // ── AI generators ──────────────────────────────────────────────────────────

  const generateOne = useCallback(async () => {
    if (!selectedCat) return;
    const cat = data.categories.find((c) => c.id === selectedCat);
    if (!cat) return;
    setAiBusy('one'); setError(null);
    try {
      const result = await aiGenerateQuestion(userName, {
        categoryName: cat.name,
        categoryDescription: cat.description,
        existingTitles: questions.map((q) => q.questionMarkdown.slice(0, 120)).slice(0, 30),
      });
      let qMd = result.questionMarkdown;
      // Best-effort image enrichment from imageQuery.
      if (result.imageQuery) {
        const img = await findImage(userName, result.imageQuery);
        if (img) qMd = `![${img.title}](${img.url})\n\n${qMd}`;
      }
      const q: MemoryQuestion = {
        id: uuid(),
        categoryId: selectedCat,
        type: result.type,
        questionMarkdown: qMd,
        answerMarkdown: result.answerMarkdown,
        choices: result.type === 'choice' && result.choices
          ? result.choices.map((c) => ({ id: uuid(), label: c.label, correct: c.correct }))
          : undefined,
        stats: { ...EMPTY_STATS },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onUpdate({ ...data, questions: [...data.questions, q] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(null);
    }
  }, [data, onUpdate, questions, selectedCat, userName]);

  const generateBatch = useCallback(async () => {
    if (!selectedCat) return;
    const cat = data.categories.find((c) => c.id === selectedCat);
    if (!cat) return;
    setAiBusy('batch'); setError(null);
    try {
      const result = await aiGenerateBatch(userName, {
        categoryName: cat.name,
        categoryDescription: cat.description,
        count: batchCount,
        existing: questions.map((q) => ({ questionMarkdown: q.questionMarkdown, type: q.type })),
      });
      const now = Date.now();
      const newQs: MemoryQuestion[] = [];
      for (const item of result.items) {
        let qMd = item.questionMarkdown;
        if (item.imageQuery) {
          const img = await findImage(userName, item.imageQuery);
          if (img) qMd = `![${img.title}](${img.url})\n\n${qMd}`;
        }
        newQs.push({
          id: uuid(),
          categoryId: selectedCat,
          type: item.type,
          questionMarkdown: qMd,
          answerMarkdown: item.answerMarkdown,
          choices: item.type === 'choice' && item.choices
            ? item.choices.map((c) => ({ id: uuid(), label: c.label, correct: c.correct }))
            : undefined,
          stats: { ...EMPTY_STATS },
          createdAt: now,
          updatedAt: now,
        });
      }
      onUpdate({ ...data, questions: [...data.questions, ...newQs] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(null);
    }
  }, [data, onUpdate, questions, selectedCat, userName, batchCount]);

  const findImageForQuestion = useCallback(async (q: MemoryQuestion) => {
    const query = prompt('Search Wikipedia for:', q.questionMarkdown.slice(0, 60));
    if (!query) return;
    setAiBusy(q.id);
    try {
      const img = await findImage(userName, query);
      if (!img) { alert('No image found'); return; }
      const updated = {
        ...q,
        questionMarkdown: `![${img.title}](${img.url})\n\n${q.questionMarkdown}`,
        updatedAt: Date.now(),
      };
      saveQuestion(updated);
    } finally {
      setAiBusy(null);
    }
  }, [saveQuestion, userName]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', gap: 2, height: '100%', minHeight: 0 }}>
      {/* Categories sidebar */}
      <Paper sx={{ width: 240, p: 1, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2">Categories ({data.categories.length})</Typography>
          <IconButton size="small" onClick={() => setNewCatOpen(true)}><AddIcon /></IconButton>
        </Box>
        <List dense sx={{ overflowY: 'auto', flex: 1 }}>
          {data.categories.map((cat) => {
            const count = data.questions.filter((q) => q.categoryId === cat.id).length;
            return (
              <ListItemButton
                key={cat.id}
                selected={selectedCat === cat.id}
                onClick={() => setSelectedCat(cat.id)}
                sx={{ borderRadius: 1 }}
              >
                <ListItemText primary={cat.name} secondary={`${count} question${count === 1 ? '' : 's'}`} />
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            );
          })}
          {data.categories.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              Create your first category to get started.
            </Typography>
          )}
        </List>
      </Paper>

      {/* Questions panel */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selectedCat && (
          <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            ← Pick a category to see its questions.
          </Paper>
        )}
        {selectedCat && (
          <>
            <Paper sx={{ p: 1.5, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({
                id: uuid(), categoryId: selectedCat, type: 'text',
                questionMarkdown: '', answerMarkdown: '',
                stats: { ...EMPTY_STATS }, createdAt: Date.now(), updatedAt: Date.now(),
              })}>
                New question
              </Button>
              <Divider orientation="vertical" flexItem />
              <Button size="small" startIcon={aiBusy === 'one' ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
                disabled={aiBusy !== null} onClick={generateOne}>
                Generate 1 with AI
              </Button>
              <Tooltip title="Opus analyses your existing questions and proposes new ones that cover gaps.">
                <Button size="small" startIcon={aiBusy === 'batch' ? <CircularProgress size={14} /> : <AutoFixHighIcon />}
                  disabled={aiBusy !== null} onClick={generateBatch}>
                  Generate batch
                </Button>
              </Tooltip>
              <TextField size="small" type="number" label="N" value={batchCount}
                onChange={(e) => setBatchCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                inputProps={{ min: 1, max: 10 }}
                sx={{ width: 70 }} />
              {error && <Typography color="error" variant="caption" sx={{ ml: 1 }}>{error}</Typography>}
            </Paper>

            <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {questions.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  No questions yet — click <strong>New question</strong> or <strong>Generate</strong> to add some.
                </Typography>
              )}
              {questions.map((q) => (
                <Card key={q.id} variant="outlined">
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Chip
                        size="small"
                        label={q.type}
                        color={q.type === 'choice' ? 'primary' : 'default'}
                        sx={{ flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {q.questionMarkdown.slice(0, 200)}{q.questionMarkdown.length > 200 ? '…' : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Asked {q.stats.askedCount}× · {q.stats.askedCount > 0
                            ? `${Math.round(100 * q.stats.correctCount / q.stats.askedCount)}% correct`
                            : 'never asked'}
                        </Typography>
                      </Box>
                      <Tooltip title="Find image (Wikipedia)">
                        <span>
                          <IconButton size="small" disabled={aiBusy !== null} onClick={() => findImageForQuestion(q)}>
                            {aiBusy === q.id ? <CircularProgress size={16} /> : <ImageSearchIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton size="small" onClick={() => setEditing(q)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => deleteQuestion(q.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </>
        )}
      </Box>

      {/* New category dialog */}
      <Dialog open={newCatOpen} onClose={() => setNewCatOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New category</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} margin="normal" />
          <TextField fullWidth label="Description (optional)" value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} margin="normal" multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewCatOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newCatName.trim()} onClick={addCategory}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Question edit dialog */}
      {editing && (
        <QuestionEditor
          question={editing}
          onCancel={() => setEditing(null)}
          onSave={saveQuestion}
        />
      )}
    </Box>
  );
}

// ─── Question editor dialog ──────────────────────────────────────────────────

function QuestionEditor({ question, onCancel, onSave }: {
  question: MemoryQuestion;
  onCancel: () => void;
  onSave: (q: MemoryQuestion) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<MemoryQuestion>(question);

  const setType = (t: QuestionType) => {
    if (t === draft.type) return;
    setDraft({
      ...draft,
      type: t,
      choices: t === 'choice'
        ? (draft.choices ?? [
            { id: uuid(), label: '', correct: true },
            { id: uuid(), label: '', correct: false },
          ])
        : undefined,
    });
  };

  const updateChoice = (i: number, patch: Partial<MemoryChoice>) => {
    const choices = (draft.choices ?? []).map((c, idx) => idx === i ? { ...c, ...patch } : c);
    // When marking one correct, mark others incorrect (only one correct in choice mode).
    if (patch.correct === true) {
      for (let j = 0; j < choices.length; j++) if (j !== i) choices[j].correct = false;
    }
    setDraft({ ...draft, choices });
  };
  const addChoice = () => setDraft({ ...draft, choices: [...(draft.choices ?? []), { id: uuid(), label: '', correct: false }] });
  const removeChoice = (i: number) => setDraft({ ...draft, choices: (draft.choices ?? []).filter((_, idx) => idx !== i) });

  const canSave = draft.questionMarkdown.trim().length > 0 &&
    (draft.type === 'text' ? true : (draft.choices ?? []).filter((c) => c.label.trim()).length >= 2 && (draft.choices ?? []).some((c) => c.correct));

  return (
    <Dialog open onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{question.questionMarkdown ? 'Edit question' : 'New question'}</DialogTitle>
      <DialogContent>
        <TextField select label="Type" value={draft.type} onChange={(e) => setType(e.target.value as QuestionType)} fullWidth margin="normal">
          <MenuItem value="text">Text — user types the answer (AI judges)</MenuItem>
          <MenuItem value="choice">Multiple choice — one correct option</MenuItem>
        </TextField>
        <TextField label="Question (Markdown)" value={draft.questionMarkdown}
          onChange={(e) => setDraft({ ...draft, questionMarkdown: e.target.value })}
          fullWidth multiline minRows={3} margin="normal"
          helperText="Markdown — images via ![alt](url), code blocks, lists" />
        {draft.type === 'text' && (
          <TextField label="Canonical answer (Markdown)" value={draft.answerMarkdown ?? ''}
            onChange={(e) => setDraft({ ...draft, answerMarkdown: e.target.value })}
            fullWidth multiline minRows={2} margin="normal"
            helperText="Sonnet compares the user's free-text answer to this — be specific but allow paraphrasing" />
        )}
        {draft.type === 'choice' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Choices — click ⦿ to mark the correct one</Typography>
            {(draft.choices ?? []).map((c, i) => (
              <Stack key={c.id} direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <IconButton size="small" onClick={() => updateChoice(i, { correct: true })}
                  sx={{ color: c.correct ? 'success.main' : 'text.disabled' }}>
                  {c.correct ? '⦿' : '○'}
                </IconButton>
                <TextField size="small" fullWidth value={c.label}
                  onChange={(e) => updateChoice(i, { label: e.target.value })}
                  placeholder={`Choice ${i + 1}`} />
                <IconButton size="small" onClick={() => removeChoice(i)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addChoice} sx={{ mt: 1 }}>Add choice</Button>
            <TextField label="Explanation (Markdown, optional)" value={draft.answerMarkdown ?? ''}
              onChange={(e) => setDraft({ ...draft, answerMarkdown: e.target.value })}
              fullWidth multiline minRows={2} margin="normal"
              helperText="Shown after the user answers — explains WHY the correct choice is correct" />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => onSave(draft)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
