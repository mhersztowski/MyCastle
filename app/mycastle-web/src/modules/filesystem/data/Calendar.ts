import { EventModel, EventsModel } from '@mhersztowski/core';
import { FileData } from './FileData';

/**
 * Represents a single day in the calendar with its events
 */
export class CalendarItem {
  private date: Date;
  private events: EventModel[] = [];
  private fileData: FileData | null = null;

  constructor(date: Date, events: EventModel[] = [], fileData?: FileData) {
    this.date = date;
    this.events = events;
    this.fileData = fileData || null;
  }

  getDate(): Date {
    return this.date;
  }

  getDateString(): string {
    return this.date.toISOString().split('T')[0];
  }

  getYear(): number {
    return this.date.getFullYear();
  }

  getMonth(): number {
    return this.date.getMonth() + 1;
  }

  getDay(): number {
    return this.date.getDate();
  }

  getEvents(): EventModel[] {
    return this.events;
  }

  setEvents(events: EventModel[]): void {
    this.events = events;
  }

  addEvent(event: EventModel): void {
    this.events.push(event);
  }

  removeEvent(index: number): void {
    this.events.splice(index, 1);
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

/**
 * Calendar class managing all calendar items (days with events)
 */
export class Calendar {
  private items: Map<string, CalendarItem> = new Map();

  getItems(): CalendarItem[] {
    return Array.from(this.items.values());
  }

  getItem(date: Date): CalendarItem | undefined {
    const key = this.dateToKey(date);
    return this.items.get(key);
  }

  getItemByDateString(dateString: string): CalendarItem | undefined {
    return this.items.get(dateString);
  }

  addItem(item: CalendarItem): void {
    const key = item.getDateString();
    this.items.set(key, item);
  }

  removeItem(date: Date): void {
    const key = this.dateToKey(date);
    this.items.delete(key);
  }

  getItemsForMonth(year: number, month: number): CalendarItem[] {
    return this.getItems().filter(
      item => item.getYear() === year && item.getMonth() === month
    );
  }

  getItemsForYear(year: number): CalendarItem[] {
    return this.getItems().filter(item => item.getYear() === year);
  }

  getItemsInRange(startDate: Date, endDate: Date): CalendarItem[] {
    return this.getItems().filter(item => {
      const date = item.getDate();
      return date >= startDate && date <= endDate;
    });
  }

  getAllEvents(): EventModel[] {
    const events: EventModel[] = [];
    for (const item of this.items.values()) {
      events.push(...item.getEvents());
    }
    return events;
  }

  clear(): void {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }

  private dateToKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
