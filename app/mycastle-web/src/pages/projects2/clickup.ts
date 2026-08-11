/**
 * Tokeny wizualne i pomocnicze widoku PIM/Projects2.
 *
 * Kolory są tu wpisane wprost, a nie brane z motywu MUI aplikacji, bo ta
 * strona ma wyglądać jak ClickUp, a nie jak reszta MyCastle. Motyw aplikacji
 * jest jasny (`theme.ts`), więc nic się nie kłóci, ale gdyby się zmienił, ten
 * widok ma zostać sobą — dlatego wszystkie tła i obramowania są jawne.
 */

import type { TaskPriority, TaskStatusDef } from '@mhersztowski/core';
import { DEFAULT_TASK_STATUSES } from '@mhersztowski/core';

export const cu = {
    brand:       '#7b68ee',
    brandSoft:   '#f0edff',
    text:        '#292d34',
    textMuted:   '#7c828d',
    border:      '#e8eaed',
    borderStrong:'#d8dce3',
    bg:          '#ffffff',
    bgSubtle:    '#f7f8f9',
    sidebar:     '#fbfbfc',
    hover:       '#f4f5f7',
    danger:      '#e5484d',
} as const;

/** Kolejność i kolory flag priorytetu — jak w palecie ClickUpa. */
export const PRIORITIES: { id: TaskPriority; label: string; color: string }[] = [
    { id: 'urgent', label: 'Pilne',   color: '#f50000' },
    { id: 'high',   label: 'Wysoki',  color: '#ffcc00' },
    { id: 'normal', label: 'Normalny',color: '#6fddff' },
    { id: 'low',    label: 'Niski',   color: '#d8d8d8' },
];

export function priorityDef(id?: TaskPriority) {
    return PRIORITIES.find(p => p.id === id);
}

/**
 * Statusy obowiązujące dla zadań projektu. Projekt może mieć własne; brak
 * oznacza zestaw domyślny, a nie „brak statusów" — inaczej zadania nie miałyby
 * gdzie stanąć na tablicy.
 */
export function statusesOf(project?: { statuses?: TaskStatusDef[] }): TaskStatusDef[] {
    return project?.statuses && project.statuses.length > 0
        ? project.statuses
        : DEFAULT_TASK_STATUSES;
}

export function statusDef(statuses: TaskStatusDef[], id?: string): TaskStatusDef {
    return statuses.find(s => s.id === id) ?? statuses[0];
}

// --- czas ------------------------------------------------------------------

/** `95` → `1h 35m`. Puste dla zera, bo „0m" w kolumnie to szum. */
export function formatMinutes(total?: number): string {
    if (!total || total <= 0) return '';
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/**
 * Szacowany czas jest w modelu **godziną ułamkową** (`TaskModel.duration`),
 * a czas zmierzony liczy się w minutach. Do wyświetlenia sprowadzamy obie
 * wielkości do minut, żeby „1h 35m / 2,5h" nie mieszało dwóch zapisów w jednym
 * wierszu.
 */
export function hoursToMinutes(hours?: number): number | undefined {
    return hours === undefined ? undefined : Math.round(hours * 60);
}

/**
 * Przyjmuje `2h 30m`, `90m`, `1,5h`, `2.5` (samo „2.5" to godziny — tak wpisuje
 * się szacunek). Zwraca **godziny** jako liczbę ułamkową albo undefined.
 */
export function parseHours(input: string): number | undefined {
    const text = input.trim().toLowerCase().replace(',', '.');
    if (!text) return undefined;

    const compound = text.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
    if (compound && (compound[1] || compound[2])) {
        const hours = parseFloat(compound[1] ?? '0') + parseInt(compound[2] ?? '0', 10) / 60;
        return roundQuarterMinute(hours);
    }

    const bare = Number(text);
    return Number.isFinite(bare) && bare >= 0 ? roundQuarterMinute(bare) : undefined;
}

/**
 * Zaokrąglenie do pełnej minuty w zapisie godzinowym. Bez tego `1h 20m` wraca
 * jako 1.3333333333333333 i tyle wchodzi do pliku JSON — liczba poprawna,
 * ale nie do przeczytania dla nikogo, kto ten plik otworzy.
 */
function roundQuarterMinute(hours: number): number {
    return Math.round(hours * 60) / 60;
}

// --- daty ------------------------------------------------------------------

const DAY = 86400000;

/** Data w skrócie: „dziś", „jutro", „12 sie" — jak w kolumnie Due date. */
export function formatDate(iso?: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const days = Math.round((startOfDay(date) - startOfDay(new Date())) / DAY);
    if (days === 0) return 'dziś';
    if (days === 1) return 'jutro';
    if (days === -1) return 'wczoraj';
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

const WEEK = 7 * DAY;

/**
 * Termin jako tydzień względem bieżącego: „Tydzień 0", „Tydzień +2".
 *
 * Przy planowaniu na tablicy konkretny dzień bywa mniej użyteczny niż to, czy
 * coś wypada w tym tygodniu, czy za dwa — stąd przełącznik obok zakładek.
 *
 * Liczy się **tydzień kalendarzowy**, a nie „ile dni od dziś": zadanie na
 * niedzielę i to na poniedziałek dzieli jeden dzień, ale należą do różnych
 * tygodni i tak też są pokazywane.
 *
 * `now` jest parametrem, żeby dało się to sprawdzić testem — funkcja zależna
 * wyłącznie od prawdziwego zegara przechodziłaby testy przez większość roku
 * i wywracała się w losowy poniedziałek.
 */
export function formatWeek(iso?: string, now: Date = new Date()): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    // Zaokrąglenie, bo przy zmianie czasu doba ma 23 albo 25 godzin i różnica
    // w milisekundach nie dzieli się równo przez długość tygodnia.
    const weeks = Math.round((startOfWeek(date) - startOfWeek(now)) / WEEK);
    if (weeks === 0) return 'Tydzień 0';
    return `Tydzień ${weeks > 0 ? '+' : '-'}${Math.abs(weeks)}`;
}

/** Poniedziałek danego tygodnia — tak liczy się tydzień w Polsce. */
function startOfWeek(date: Date): number {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // getDay() daje 0 dla niedzieli; przesunięcie ustawia poniedziałek na 0.
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start.getTime();
}

/** Termin minął — kolumna świeci wtedy na czerwono, tak jak w ClickUpie. */
export function isOverdue(iso?: string): boolean {
    if (!iso) return false;
    const date = new Date(iso);
    return !Number.isNaN(date.getTime()) && startOfDay(date) < startOfDay(new Date());
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** `<input type="date">` chce `YYYY-MM-DD`, a w modelu bywa pełne ISO. */
export function toDateInput(iso?: string): string {
    return iso ? iso.slice(0, 10) : '';
}

// --- kolory osób -----------------------------------------------------------

const AVATAR_COLORS = ['#7b68ee', '#ff7fab', '#2ecd6f', '#ffa600', '#00b3e6', '#e5484d', '#8f00ff'];

/** Stały kolor awatara dla danego id — ta sama osoba ma go wszędzie taki sam. */
export function avatarColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
