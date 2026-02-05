/**
 * AI Planner - prompt builder i parser odpowiedzi
 */

import { DayTemplateEvent } from './types';
import { EventNode } from '../../modules/filesystem/nodes';
import { TaskModel } from '../../modules/filesystem/models/TaskModel';

export interface PlannerContext {
  date: string;
  dayOfWeek: string;
  existingEvents: { name: string; startTime: string; endTime?: string }[];
  recentDaysEvents: { date: string; events: { name: string; startTime: string; endTime?: string }[] }[];
  tasks: { id: string; name: string; projectId?: string; duration?: number }[];
  userPreferences: string;
}

export interface SuggestedEvent extends DayTemplateEvent {
  accepted: boolean;
}

export function buildPlannerSystemPrompt(): string {
  return `You are a personal day planner assistant. Your job is to create a daily schedule based on the user's habits, tasks, and preferences.

Rules:
- Generate a list of events for the specified day
- Use 24-hour time format (HH:mm)
- Events should not overlap
- Consider the user's historical patterns from recent days
- Prioritize tasks the user has defined
- Leave reasonable gaps between events
- Be realistic about time allocations
- If there are existing events for the day, work around them

Output format: Return ONLY a JSON array of event objects, no other text:
[
  {
    "name": "Event name",
    "description": "Optional description",
    "taskId": "optional-task-id",
    "startTime": "HH:mm",
    "endTime": "HH:mm"
  }
]`;
}

export function buildPlannerUserPrompt(context: PlannerContext): string {
  let prompt = `Plan my day for ${context.dayOfWeek}, ${context.date}.\n\n`;

  if (context.existingEvents.length > 0) {
    prompt += `Already scheduled events (work around these):\n`;
    for (const e of context.existingEvents) {
      prompt += `- ${e.startTime}${e.endTime ? `-${e.endTime}` : ''}: ${e.name}\n`;
    }
    prompt += '\n';
  }

  if (context.recentDaysEvents.length > 0) {
    prompt += `My schedule from recent days (for pattern reference):\n`;
    for (const day of context.recentDaysEvents) {
      if (day.events.length === 0) continue;
      prompt += `${day.date}:\n`;
      for (const e of day.events) {
        prompt += `  - ${e.startTime}${e.endTime ? `-${e.endTime}` : ''}: ${e.name}\n`;
      }
    }
    prompt += '\n';
  }

  if (context.tasks.length > 0) {
    prompt += `Available tasks to schedule:\n`;
    for (const t of context.tasks) {
      prompt += `- ${t.name} (id: ${t.id}${t.duration ? `, ~${t.duration}min` : ''})\n`;
    }
    prompt += '\n';
  }

  if (context.userPreferences) {
    prompt += `My preferences: ${context.userPreferences}\n`;
  }

  return prompt;
}

export function parsePlannerResponse(response: string): SuggestedEvent[] {
  let jsonStr = response.trim();

  // Handle markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to extract JSON array if wrapped in other text
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonStr = arrayMatch[0];
  }

  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not a JSON array');
  }

  return parsed.map((item: Record<string, unknown>) => ({
    name: String(item.name || 'Untitled'),
    description: item.description ? String(item.description) : undefined,
    taskId: item.taskId ? String(item.taskId) : undefined,
    startTime: String(item.startTime || '00:00'),
    endTime: item.endTime ? String(item.endTime) : undefined,
    accepted: true,
  }));
}

export function buildContextFromEvents(
  events: EventNode[],
): { name: string; startTime: string; endTime?: string }[] {
  return events.map(e => ({
    name: e.getDisplayName(),
    startTime: e.getStartDate()?.format('HH:mm') || '00:00',
    endTime: e.getEndDate()?.format('HH:mm'),
  }));
}

export function buildTasksList(tasks: TaskModel[]): { id: string; name: string; projectId?: string; duration?: number }[] {
  return tasks.map(t => ({
    id: t.id,
    name: t.name,
    projectId: t.projectId,
    duration: t.duration,
  }));
}
