/** Częstotliwość powtarzania eventu. `weekdays` = wybrane dni tygodnia. */
export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly" | "weekdays";

export interface RecurrenceModel {
    freq: RecurrenceFreq;
    /** Co ile jednostek (dni/tygodni/miesięcy/lat). Domyślnie 1. Ignorowane dla "weekdays". */
    interval?: number;
    /** Dla freq="weekdays": dni tygodnia 0=niedziela … 6=sobota. */
    weekdays?: number[];
    /** Opcjonalna data końcowa powtarzania (ISO lub YYYY-MM-DD). */
    until?: string;
}

export interface EventModel {
    type: "event";
    taskId?: string;
    name: string;
    description?: string;
    startTime: string;
    endTime?: string;
    components?: EventComponentModel[];
    /** Reguła powtarzania. Brak = event jednorazowy. */
    recurrence?: RecurrenceModel;
    /** Daty (YYYY-MM-DD) anulowanych wystąpień powtarzającego się eventu. */
    exceptions?: string[];
}

export interface EventsModel {
    type: "events";
    tasks: EventModel[];
}

export interface EventComponentModel {
    type: string;
}

export interface EventTestComponentModel extends EventComponentModel {
    type: "event_test";
    name: string;
    description: string;
}
