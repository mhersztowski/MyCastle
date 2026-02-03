import { Dayjs } from 'dayjs';

export interface CurrentEvent {
  name: string;
  description?: string;
  taskId?: string;
  startTime: Dayjs;
  endTime?: Dayjs;
}
