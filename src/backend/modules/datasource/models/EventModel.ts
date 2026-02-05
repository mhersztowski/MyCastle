export interface EventModel {
    type: "event";
    taskId?: string;
    name: string;
    description?: string;
    startTime: string;
    endTime?: string;
    components?: EventComponentModel[];
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
