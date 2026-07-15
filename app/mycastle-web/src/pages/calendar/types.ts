import { Dayjs } from 'dayjs';
import { RecurrenceModel } from '@mhersztowski/core';

export interface CurrentEvent {
  name: string;
  description?: string;
  taskId?: string;
  startTime: Dayjs;
  endTime?: Dayjs;
  recurrence?: RecurrenceModel;
}

export interface DayTemplateEvent {
  name: string;
  description?: string;
  taskId?: string;
  startTime: string; // HH:mm
  endTime?: string;   // HH:mm
}

export interface DayTemplate {
  id: string;
  name: string;
  events: DayTemplateEvent[];
}

export interface DayTemplatesFile {
  type: 'day_templates';
  templates: DayTemplate[];
}
