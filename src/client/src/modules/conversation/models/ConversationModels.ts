/**
 * Conversation module - interfejsy modeli danych
 */

import { AiToolCall } from '../../ai/models/AiModels';

// ===== AKCJE =====

export type ConversationActionCategory =
  | 'tasks' | 'calendar' | 'files' | 'persons'
  | 'projects' | 'navigation' | 'automate' | 'system';

export interface ConversationAction {
  name: string;
  description: string;
  category: ConversationActionCategory;
  parameters: Record<string, unknown>;
  confirmation?: boolean;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

// ===== WIADOMOŚCI =====

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  toolName?: string;
}

// ===== SCENARIUSZE =====

export interface ContextInjector {
  type: 'tasks_summary' | 'events_today' | 'projects_summary' | 'custom';
  label: string;
  customPrompt?: string;
}

export interface ConversationScenario {
  id: string;
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  enabledCategories: ConversationActionCategory[];
  contextInjectors?: ContextInjector[];
  triggerPhrases?: string[];
  greeting?: string;
  temperature?: number;
}

// ===== KONFIGURACJA =====

export interface ConversationConfig {
  type: 'conversation_config';
  agentMode: boolean;
  activeScenarioId?: string;
  scenarios: ConversationScenario[];
  maxToolCallsPerTurn: number;
  requireConfirmation: boolean;
  historyLimit: number;
}

// ===== HISTORIA =====

export interface ConversationHistoryModel {
  type: 'conversation_history';
  scenarioId?: string;
  messages: ConversationMessage[];
  updatedAt: number;
}

// ===== CALLBACKI SILNIKA =====

export interface ConversationEngineCallbacks {
  onToolCallStart?: (toolCall: AiToolCall) => void;
  onToolCallComplete?: (toolCall: AiToolCall, result: unknown) => void;
  onToolCallError?: (toolCall: AiToolCall, error: string) => void;
  onConfirmationRequired?: (toolCall: AiToolCall, parsedArgs: Record<string, unknown>) => Promise<boolean>;
  onMessage?: (message: ConversationMessage) => void;
}

// ===== DEFAULTS =====

export const DEFAULT_SCENARIOS: ConversationScenario[] = [
  {
    id: 'general',
    name: 'Asystent ogólny',
    description: 'Uniwersalny asystent z dostępem do wszystkich funkcji systemu',
    icon: 'SmartToy',
    systemPrompt: `Jesteś Castle Agent - osobistym asystentem z dostępem do systemu MyCastle.
Możesz zarządzać taskami, kalendarzem, plikami, osobami i projektami.
Używaj dostępnych narzędzi aby pomagać użytkownikowi.
Odpowiadaj krótko i naturalnie po polsku.
Gdy wykonujesz akcję, informuj użytkownika co robisz.`,
    enabledCategories: ['tasks', 'calendar', 'files', 'persons', 'projects', 'navigation', 'automate', 'system'],
    greeting: 'Cześć! Jestem Castle Agent. Jak mogę Ci pomóc?',
  },
  {
    id: 'task_manager',
    name: 'Menedżer tasków',
    description: 'Skupiony na zarządzaniu zadaniami i projektami',
    icon: 'TaskAlt',
    systemPrompt: `Jesteś menedżerem zadań w systemie MyCastle.
Pomagasz użytkownikowi zarządzać taskami i projektami.
Możesz tworzyć, edytować, usuwać i wyszukiwać taski.
Odpowiadaj krótko i konkretnie.`,
    enabledCategories: ['tasks', 'projects'],
    contextInjectors: [
      { type: 'tasks_summary', label: 'Aktualne taski' },
    ],
    greeting: 'Gotowy do zarządzania Twoimi taskami. Co chcesz zrobić?',
  },
  {
    id: 'day_planner',
    name: 'Planista dnia',
    description: 'Pomaga w planowaniu dnia z kalendarzem i taskami',
    icon: 'CalendarMonth',
    systemPrompt: `Jesteś planistą dnia w systemie MyCastle.
Pomagasz użytkownikowi planować dzień, przeglądać kalendarz i zarządzać wydarzeniami.
Bierz pod uwagę aktualne taski i eventy przy sugestiach.
Odpowiadaj krótko i pomocnie.`,
    enabledCategories: ['calendar', 'tasks'],
    contextInjectors: [
      { type: 'events_today', label: 'Dzisiejsze eventy' },
      { type: 'tasks_summary', label: 'Aktualne taski' },
    ],
    greeting: 'Dzień dobry! Pomogę Ci zaplanować dzień. Oto co masz na dziś.',
  },
  {
    id: 'file_explorer',
    name: 'Eksplorator plików',
    description: 'Przeglądanie i edycja plików w systemie',
    icon: 'FolderOpen',
    systemPrompt: `Jesteś eksploratorem plików w systemie MyCastle.
Pomagasz użytkownikowi przeglądać, czytać i edytować pliki.
Możesz nawigować po katalogach i otwierać strony systemu.
Odpowiadaj krótko.`,
    enabledCategories: ['files', 'navigation'],
    greeting: 'Gotowy do przeglądania plików. Jaki katalog chcesz zobaczyć?',
  },
];

export const DEFAULT_CONVERSATION_CONFIG: ConversationConfig = {
  type: 'conversation_config',
  agentMode: false,
  activeScenarioId: 'general',
  scenarios: DEFAULT_SCENARIOS,
  maxToolCallsPerTurn: 10,
  requireConfirmation: true,
  historyLimit: 50,
};
