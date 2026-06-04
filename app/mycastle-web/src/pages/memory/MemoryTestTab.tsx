/**
 * Memory page — Test tab.
 *
 * Flow:
 *   1. Pick one or more categories
 *   2. Smart-random a question (least-asked first via pickSmartQuestion)
 *   3. User answers — text (judged by sonnet) or choice
 *   4. Verdict shown; user can ask opus for a deep explanation
 *   5. User can "Next question" or "End session" anytime
 *
 * Every answer updates per-question stats AND appends to the current
 * `MemorySession` so the Statistics tab has a full history.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  Divider, FormControlLabel, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import StopIcon from '@mui/icons-material/Stop';
import { v4 as uuid } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aiCheckAnswer, aiExplain } from './MemoryService';
import { pickSmartQuestion } from './types';
import type { MemoryData, MemoryQuestion, MemorySession, SessionAnswer } from './types';

interface Props {
  data: MemoryData;
  userName: string;
  onUpdate: (next: MemoryData) => void;
}

type Verdict = { correct: boolean; verdict: string };

export default function MemoryTestTab({ data, userName, onUpdate }: Props): React.JSX.Element {
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<MemorySession | null>(null);
  const [current, setCurrent] = useState<{ q: MemoryQuestion; askedAt: number } | null>(null);

  // Per-question scratch state
  const [textAnswer, setTextAnswer] = useState('');
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [judging, setJudging] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleQuestions = useMemo(() => {
    if (selectedCats.size === 0) return [];
    return data.questions.filter((q) => selectedCats.has(q.categoryId));
  }, [data.questions, selectedCats]);

  // ── Session lifecycle ──────────────────────────────────────────────────────

  const startSession = useCallback(() => {
    if (eligibleQuestions.length === 0) return;
    const s: MemorySession = {
      id: uuid(),
      categoryIds: Array.from(selectedCats),
      startedAt: Date.now(),
      answers: [],
    };
    setSession(s);
    advance(s, eligibleQuestions);
  }, [eligibleQuestions, selectedCats]);

  const endSession = useCallback(() => {
    if (!session) return;
    const finished = { ...session, endedAt: Date.now() };
    onUpdate({ ...data, sessions: [...data.sessions, finished] });
    setSession(null);
    setCurrent(null);
    setVerdict(null);
    setExplanation(null);
    setTextAnswer('');
    setChoiceId(null);
  }, [session, data, onUpdate]);

  // Resets per-question scratch + picks next question
  const advance = useCallback((s: MemorySession, pool: MemoryQuestion[]) => {
    setVerdict(null);
    setExplanation(null);
    setTextAnswer('');
    setChoiceId(null);
    setError(null);
    const q = pickSmartQuestion(pool);
    if (!q) { setCurrent(null); return; }
    setCurrent({ q, askedAt: Date.now() });
    void s;
  }, []);

  // ── Submit answer ──────────────────────────────────────────────────────────

  const submit = useCallback(async () => {
    if (!current || !session) return;
    setJudging(true); setError(null);
    try {
      let correct = false;
      let aiVerdictText: string | undefined;
      let userAnswerText: string;

      if (current.q.type === 'choice') {
        if (!choiceId) { setError('Pick an answer first.'); setJudging(false); return; }
        const chosen = (current.q.choices ?? []).find((c) => c.id === choiceId);
        if (!chosen) { setError('Pick a valid choice.'); setJudging(false); return; }
        correct = chosen.correct;
        userAnswerText = chosen.label;
        setVerdict({ correct, verdict: correct ? 'Correct choice.' : 'That option is incorrect.' });
      } else {
        if (!textAnswer.trim()) { setError('Type an answer first.'); setJudging(false); return; }
        userAnswerText = textAnswer;
        const r = await aiCheckAnswer(userName, {
          questionMarkdown: current.q.questionMarkdown,
          canonicalAnswer: current.q.answerMarkdown ?? '',
          userAnswer: textAnswer,
        });
        correct = r.correct;
        aiVerdictText = r.verdict;
        setVerdict({ correct, verdict: r.verdict });
      }

      // Persist answer + bump per-question stats
      const ans: SessionAnswer = {
        questionId: current.q.id,
        userAnswer: userAnswerText,
        correct,
        aiVerdict: aiVerdictText,
        askedAt: current.askedAt,
        answeredAt: Date.now(),
      };
      const updatedSession = { ...session, answers: [...session.answers, ans] };
      setSession(updatedSession);

      const updatedQuestions = data.questions.map((q) => q.id !== current.q.id ? q : {
        ...q,
        stats: {
          askedCount: q.stats.askedCount + 1,
          correctCount: q.stats.correctCount + (correct ? 1 : 0),
          lastAskedAt: Date.now(),
        },
        updatedAt: Date.now(),
      });
      onUpdate({ ...data, questions: updatedQuestions });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJudging(false);
    }
  }, [current, session, choiceId, textAnswer, userName, data, onUpdate]);

  /**
   * "Nie wiem" — user gives up on this question. Counts as a wrong answer
   * (bumps askedCount, NOT correctCount) so the smart-random picker keeps
   * surfacing it until the user nails it later. Skips the AI judge entirely
   * — no token spend, instant feedback, canonical answer is revealed.
   */
  const dontKnow = useCallback(() => {
    if (!current || !session) return;
    const verdictText = 'Pominięte — nie znałeś odpowiedzi. Zobacz prawidłową odpowiedź poniżej.';
    setVerdict({ correct: false, verdict: verdictText });
    const ans: SessionAnswer = {
      questionId: current.q.id,
      userAnswer: '(nie wiem)',
      correct: false,
      aiVerdict: verdictText,
      askedAt: current.askedAt,
      answeredAt: Date.now(),
    };
    setSession({ ...session, answers: [...session.answers, ans] });
    const updatedQuestions = data.questions.map((q) => q.id !== current.q.id ? q : {
      ...q,
      stats: {
        askedCount: q.stats.askedCount + 1,
        correctCount: q.stats.correctCount,   // NOT incremented
        lastAskedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    onUpdate({ ...data, questions: updatedQuestions });
  }, [current, session, data, onUpdate]);

  const next = useCallback(() => {
    if (!session) return;
    // Use latest data — eligibleQuestions reflects fresh stats after our update.
    advance(session, eligibleQuestions);
  }, [session, eligibleQuestions, advance]);

  const explain = useCallback(async () => {
    if (!current) return;
    setExplaining(true); setError(null);
    try {
      const r = await aiExplain(userName, {
        questionMarkdown: current.q.questionMarkdown,
        answerMarkdown: current.q.answerMarkdown,
      });
      setExplanation(r.explanation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExplaining(false);
    }
  }, [current, userName]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Pre-session: category picker
  if (!session) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h6">Pick categories to test</Typography>
        {data.categories.length === 0 && (
          <Alert severity="info">
            No categories yet. Switch to the <strong>Design</strong> tab to create some questions first.
          </Alert>
        )}
        <Paper sx={{ p: 1 }}>
          {data.categories.map((cat) => {
            const count = data.questions.filter((q) => q.categoryId === cat.id).length;
            return (
              <FormControlLabel
                key={cat.id}
                control={<Checkbox
                  checked={selectedCats.has(cat.id)}
                  onChange={(e) => {
                    const next = new Set(selectedCats);
                    if (e.target.checked) next.add(cat.id); else next.delete(cat.id);
                    setSelectedCats(next);
                  }}
                  disabled={count === 0}
                />}
                label={<><strong>{cat.name}</strong> <Typography component="span" color="text.secondary">({count})</Typography></>}
                sx={{ display: 'block' }}
              />
            );
          })}
        </Paper>
        <Box>
          <Button
            variant="contained"
            size="large"
            disabled={eligibleQuestions.length === 0}
            onClick={startSession}
          >
            Start test — {eligibleQuestions.length} question{eligibleQuestions.length === 1 ? '' : 's'} in pool
          </Button>
        </Box>
      </Box>
    );
  }

  // In-session: question card
  const score = `${session.answers.filter((a) => a.correct).length} / ${session.answers.length} correct`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 800, mx: 'auto' }}>
      <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip label={`Session · ${session.answers.length} answered · ${score}`} />
        <Box sx={{ flex: 1 }} />
        <Button color="warning" startIcon={<StopIcon />} onClick={endSession}>End test</Button>
      </Paper>

      {!current && (
        <Alert severity="success">
          No more questions in this pool. <Button onClick={endSession}>Wrap up</Button>
        </Alert>
      )}

      {current && (
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" label={current.q.type === 'choice' ? 'Choice' : 'Text'} />
              <Chip size="small" variant="outlined" label={`Asked ${current.q.stats.askedCount}× before`} />
            </Stack>

            <Box sx={{ '& img': { maxWidth: '100%', height: 'auto', borderRadius: 1 } }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.q.questionMarkdown}</ReactMarkdown>
            </Box>

            <Divider sx={{ my: 2 }} />

            {current.q.type === 'text' && (
              <TextField
                fullWidth multiline minRows={3}
                label="Your answer" value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={verdict !== null || judging}
              />
            )}
            {current.q.type === 'choice' && (
              <Stack spacing={1}>
                {(current.q.choices ?? []).map((c) => {
                  const selected = choiceId === c.id;
                  const revealed = verdict !== null;
                  const colour = !revealed
                    ? (selected ? 'primary.main' : 'divider')
                    : c.correct ? 'success.main' : (selected ? 'error.main' : 'divider');
                  return (
                    <Button
                      key={c.id}
                      variant={selected ? 'contained' : 'outlined'}
                      onClick={() => !revealed && setChoiceId(c.id)}
                      disabled={revealed && !selected && !c.correct}
                      sx={{
                        justifyContent: 'flex-start',
                        textTransform: 'none',
                        borderColor: colour,
                        color: revealed ? (c.correct ? 'success.main' : selected ? 'error.main' : 'text.primary') : undefined,
                      }}
                    >
                      {revealed && c.correct && <CheckCircleIcon sx={{ mr: 1, fontSize: 18 }} />}
                      {revealed && !c.correct && selected && <CancelIcon sx={{ mr: 1, fontSize: 18 }} />}
                      {c.label}
                    </Button>
                  );
                })}
              </Stack>
            )}

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {/* Verdict + actions */}
            {verdict === null && (
              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" disabled={judging} onClick={submit}
                  startIcon={judging ? <CircularProgress size={16} /> : undefined}>
                  Submit answer
                </Button>
                <Button variant="outlined" color="warning" disabled={judging} onClick={dontKnow}
                  startIcon={<HelpOutlineIcon />}>
                  Nie wiem
                </Button>
              </Box>
            )}
            {verdict !== null && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={verdict.correct ? 'success' : 'error'} sx={{ mb: 1 }}>
                  <strong>{verdict.correct ? 'Correct' : 'Not quite'}.</strong> {verdict.verdict}
                </Alert>
                {current.q.answerMarkdown && (
                  <Paper variant="outlined" sx={{ p: 1.5, mb: 1, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary">Canonical answer / explanation</Typography>
                    <Box sx={{ '& img': { maxWidth: '100%', height: 'auto' } }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.q.answerMarkdown}</ReactMarkdown>
                    </Box>
                  </Paper>
                )}
                {explanation && (
                  <Paper variant="outlined" sx={{ p: 1.5, mb: 1, bgcolor: 'primary.50' }}>
                    <Typography variant="caption" color="primary">AI explanation (opus)</Typography>
                    <Box sx={{ '& img': { maxWidth: '100%', height: 'auto' } }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
                    </Box>
                  </Paper>
                )}
                <Stack direction="row" spacing={1}>
                  <Button onClick={explain} disabled={explaining}
                    startIcon={explaining ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}>
                    Explain with AI
                  </Button>
                  <Button variant="contained" onClick={next}>Next question</Button>
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
