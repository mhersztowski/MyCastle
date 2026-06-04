/**
 * Memory PIM page — data model.
 *
 * Stored as a single `data/memory.json` per user (same pattern as HealthPage).
 * Three top-level collections: categories, questions, sessions.
 *
 * Stats (`askedCount`, `correctCount`, `lastAskedAt`) live on the question
 * itself for O(1) access during the "pick smart random" step — the
 * authoritative source is still `sessions[].answers[]` (statystyki sesji
 * można odbudować, gdyby coś się rozjechało).
 */

export interface MemoryCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export type QuestionType = 'text' | 'choice';

export interface MemoryChoice {
  id: string;
  label: string;
  correct: boolean;
}

export interface MemoryQuestionStats {
  askedCount: number;
  correctCount: number;
  lastAskedAt?: number;
}

export interface MemoryQuestion {
  id: string;
  categoryId: string;
  type: QuestionType;
  /** Question body (Markdown — may contain images, code blocks, etc.). */
  questionMarkdown: string;
  /** Canonical answer body (Markdown). For `type === 'text'` used by AI judge. */
  answerMarkdown?: string;
  /** Only for `type === 'choice'` — 2..6 options. */
  choices?: MemoryChoice[];
  stats: MemoryQuestionStats;
  /** Optional tags for richer filtering later. */
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionAnswer {
  questionId: string;
  /** What the user submitted. For choice: id of the selected choice. */
  userAnswer: string;
  correct: boolean;
  /** AI's reasoning (only for `text` type — sonnet's verdict). */
  aiVerdict?: string;
  askedAt: number;
  answeredAt: number;
}

export interface MemorySession {
  id: string;
  /** Categories selected at session start. */
  categoryIds: string[];
  startedAt: number;
  endedAt?: number;
  answers: SessionAnswer[];
}

export interface MemoryData {
  type: 'memory_data';
  version: 1;
  categories: MemoryCategory[];
  questions: MemoryQuestion[];
  sessions: MemorySession[];
}

export const EMPTY_MEMORY: MemoryData = {
  type: 'memory_data',
  version: 1,
  categories: [],
  questions: [],
  sessions: [],
};

/**
 * Pick the next question for a Test session, prefering questions that have
 * been asked least often. Stable algorithm: sort by `askedCount` then
 * `lastAskedAt`, take the bottom third (min 3), pick uniformly.
 *
 * Returns `null` when the pool is empty.
 */
export function pickSmartQuestion(qs: MemoryQuestion[]): MemoryQuestion | null {
  if (qs.length === 0) return null;
  const sorted = [...qs].sort((a, b) => {
    const ca = a.stats.askedCount;
    const cb = b.stats.askedCount;
    if (ca !== cb) return ca - cb;
    return (a.stats.lastAskedAt ?? 0) - (b.stats.lastAskedAt ?? 0);
  });
  const poolSize = Math.max(3, Math.ceil(sorted.length / 3));
  const pool = sorted.slice(0, Math.min(poolSize, sorted.length));
  return pool[Math.floor(Math.random() * pool.length)];
}
