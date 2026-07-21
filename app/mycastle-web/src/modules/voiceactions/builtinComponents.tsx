/**
 * Komponenty wbudowane (dostępne w Programming/Components i w bloczku „Wyświetl komponent").
 * Na razie: kalendarzowe „Add Event" / „Start New Event" — funkcjonalne (zapisują event do VFS).
 */
import React, { useCallback, useState } from 'react';
import { Button } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import dayjs from 'dayjs';
import EventAddModal from '../../pages/calendar/EventAddModal';
import type { CurrentEvent } from '../../pages/calendar/types';
import { useFilesystem } from '../filesystem';
import type { EventModel, EventsModel } from '@mhersztowski/core';

export interface BuiltinComponentDef {
  id: string;
  name: string;
}

export const BUILTIN_COMPONENTS: BuiltinComponentDef[] = [
  { id: 'calendar_add_event', name: 'Add Event' },
  { id: 'calendar_start_event', name: 'Start New Event' },
];

export const isBuiltinComponent = (id: string): boolean =>
  BUILTIN_COMPONENTS.some(c => c.id === id);

/**
 * Widok komponentu wbudowanego. Renderuje przycisk otwierający okno dodawania eventu
 * (EventAddModal), a po zatwierdzeniu zapisuje event do kalendarza (data/calendar/YYYY/MM/DD.json).
 */
export const BuiltinComponentView: React.FC<{ id: string; autoOpen?: boolean }> = ({ id, autoOpen }) => {
  const { dataSource, writeFile } = useFilesystem();
  const [open, setOpen] = useState<boolean>(!!autoOpen);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const def = BUILTIN_COMPONENTS.find(c => c.id === id);
  const isPermanent = id === 'calendar_add_event';

  const saveEvent = useCallback(async (event: CurrentEvent) => {
    try {
      const end = event.endTime ?? event.startTime.add(1, 'hour');
      const dateStr = event.startTime.format('YYYY-MM-DD');
      const [year, month, day] = dateStr.split('-');
      const newEvent: EventModel = {
        type: 'event',
        name: event.name,
        description: event.description,
        taskId: event.taskId,
        startTime: event.startTime.toISOString(),
        endTime: end.toISOString(),
        recurrence: event.recurrence,
      };
      const filePath = `data/calendar/${year}/${month}/${day}.json`;
      const existing = dataSource.events
        .filter(e => { const d = e.getStartDate(); return d && d.format('YYYY-MM-DD') === dateStr; })
        .map(e => e.toModel());
      const eventsModel: EventsModel = { type: 'events', tasks: [...existing, newEvent] };
      await writeFile(filePath, JSON.stringify(eventsModel, null, 2));
      setSavedMsg(`Dodano event „${event.name}" (${event.startTime.format('YYYY-MM-DD HH:mm')})`);
    } catch (err) {
      setSavedMsg(`Błąd zapisu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOpen(false);
    }
  }, [dataSource.events, writeFile]);

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <Button variant="outlined" size="small" startIcon={<EventIcon />} onClick={() => setOpen(true)}>
        {def?.name ?? 'Komponent'}
      </Button>
      {savedMsg && <span style={{ fontSize: 12, color: '#4caf50' }}>{savedMsg}</span>}
      <EventAddModal
        open={open}
        onClose={() => setOpen(false)}
        onAdd={saveEvent}
        mode={isPermanent ? 'permanent' : 'current'}
        initialStartTime={dayjs()}
      />
    </span>
  );
};
