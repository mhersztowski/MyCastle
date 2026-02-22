import { CalendarItem as CoreCalendarItem } from '@mhersztowski/core';
import type { EventModel, EventsModel } from '@mhersztowski/core';
import { FileData } from './FileData';

export class CalendarItem extends CoreCalendarItem {
  private fileData: FileData | null = null;

  constructor(date: Date, events: EventModel[] = [], fileData?: FileData) {
    super(date, events);
    this.fileData = fileData || null;
  }

  getFileData(): FileData | null {
    return this.fileData;
  }

  setFileData(fileData: FileData): void {
    this.fileData = fileData;
  }

  static fromFileData(fileData: FileData): CalendarItem | null {
    const path = fileData.getPath();
    const dateMatch = path.match(/calendar\/(\d{4})\/(\d{2})\/(\d{2})\.json$/);

    if (!dateMatch) {
      return null;
    }

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const day = parseInt(dateMatch[3], 10);
    const date = new Date(year, month, day);

    let events: EventModel[] = [];

    try {
      const content = fileData.toString();
      if (content) {
        const data = JSON.parse(content) as EventsModel;
        if (data.type === 'events' && Array.isArray(data.tasks)) {
          events = data.tasks;
        }
      }
    } catch (err) {
      console.warn(`Failed to parse calendar file ${path}:`, err);
    }

    return new CalendarItem(date, events, fileData);
  }
}

export { Calendar } from '@mhersztowski/core';
