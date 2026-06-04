/**
 * Memory page — REST client for the AI proxy endpoints.
 *
 * All endpoints live under `/api/users/{userName}/memory/ai/*`. The token
 * is read from MinisApiService (same pattern as the rest of the app).
 */

import { App } from '../../App';
import type { MemoryQuestion } from './types';

interface RestError { error: string }

async function call<T>(path: string, body: unknown): Promise<T> {
  const auth = (App.instance as { authService?: { token?: string } }).authService;
  const token = auth?.token ?? (() => {
    try {
      const raw = localStorage.getItem('minis_current_user');
      return raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    } catch { return undefined; }
  })();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as T | RestError;
  if (!res.ok) {
    const msg = (json as RestError).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

function base(userName: string): string {
  return `/api/users/${encodeURIComponent(userName)}/memory/ai`;
}

export interface CheckAnswerResult {
  correct: boolean;
  verdict: string;     // AI's reasoning, ~1-3 sentences
}

/** Sonnet judge — compares user's free-text answer to the canonical one. */
export function aiCheckAnswer(userName: string, params: {
  questionMarkdown: string;
  canonicalAnswer: string;
  userAnswer: string;
}): Promise<CheckAnswerResult> {
  return call<CheckAnswerResult>(`${base(userName)}/check`, params);
}

export interface GenerateQuestionResult {
  questionMarkdown: string;
  answerMarkdown: string;
  type: 'text' | 'choice';
  choices?: Array<{ label: string; correct: boolean }>;
  imageQuery?: string;   // suggested image search query (used by find-image)
}

/** Opus — generate a single question + answer for a topic. */
export function aiGenerateQuestion(userName: string, params: {
  categoryName: string;
  categoryDescription?: string;
  topic?: string;
  preferredType?: 'text' | 'choice';
  existingTitles?: string[];   // to avoid duplicates
}): Promise<GenerateQuestionResult> {
  return call<GenerateQuestionResult>(`${base(userName)}/generate-one`, params);
}

/** Opus — analyse existing questions for a category and propose N new ones. */
export function aiGenerateBatch(userName: string, params: {
  categoryName: string;
  categoryDescription?: string;
  count: number;                       // how many to generate (1..10)
  existing: Array<Pick<MemoryQuestion, 'questionMarkdown' | 'type'>>;
}): Promise<{ items: GenerateQuestionResult[] }> {
  return call(`${base(userName)}/generate-batch`, params);
}

/** Opus — deep explanation of a single question + its canonical answer. */
export function aiExplain(userName: string, params: {
  questionMarkdown: string;
  answerMarkdown?: string;
}): Promise<{ explanation: string }> {
  return call(`${base(userName)}/explain`, params);
}

/** Wikipedia search → first thumbnail. Returns null when no image found. */
export interface ImageResult { url: string; title: string; sourceUrl: string }

export async function findImage(userName: string, query: string): Promise<ImageResult | null> {
  try {
    const r = await call<{ image: ImageResult | null }>(`${base(userName)}/find-image`, { query });
    return r.image;
  } catch {
    return null;
  }
}
