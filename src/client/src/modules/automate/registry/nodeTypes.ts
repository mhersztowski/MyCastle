/**
 * Rejestr typów nodów - metadane i domyślne konfiguracje
 */

import { SvgIconProps } from '@mui/material';
import { AutomateNodeType, AutomateNodeRuntime } from '../models';
import { AutomatePortModel } from '../models/AutomatePortModel';

import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CodeIcon from '@mui/icons-material/Code';
import ApiIcon from '@mui/icons-material/Api';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import LoopIcon from '@mui/icons-material/Loop';
import RepeatIcon from '@mui/icons-material/Repeat';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import TerminalIcon from '@mui/icons-material/Terminal';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CommentIcon from '@mui/icons-material/Comment';
import PsychologyIcon from '@mui/icons-material/Psychology';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import MicIcon from '@mui/icons-material/Mic';

export type AutomateNodeCategory = 'triggers' | 'actions' | 'logic' | 'data' | 'output' | 'ai' | 'utility';

type IconComponent = React.ComponentType<SvgIconProps>;

export interface AutomateNodeTypeMetadata {
  nodeType: AutomateNodeType;
  label: string;
  icon: IconComponent;
  category: AutomateNodeCategory;
  description: string;
  color: string;
  defaultInputs: AutomatePortModel[];
  defaultOutputs: AutomatePortModel[];
  defaultConfig: Record<string, unknown>;
  hasScript: boolean;
  runtime: AutomateNodeRuntime;
}

export const NODE_TYPE_METADATA: Record<AutomateNodeType, AutomateNodeTypeMetadata> = {
  start: {
    nodeType: 'start',
    label: 'Start',
    icon: PlayArrowIcon,
    category: 'triggers',
    description: 'Punkt startowy flow',
    color: '#4caf50',
    defaultInputs: [],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: {},
    hasScript: false,
    runtime: 'universal',
  },
  manual_trigger: {
    nodeType: 'manual_trigger',
    label: 'Manual Trigger',
    icon: TouchAppIcon,
    category: 'triggers',
    description: 'Ręczne uruchomienie z payloadem',
    color: '#4caf50',
    defaultInputs: [],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'any' }],
    defaultConfig: { payload: '{}', useScript: false },
    hasScript: true,
    runtime: 'universal',
  },
  js_execute: {
    nodeType: 'js_execute',
    label: 'Execute JS',
    icon: CodeIcon,
    category: 'actions',
    description: 'Wykonaj kod JavaScript',
    color: '#ff9800',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: {},
    hasScript: true,
    runtime: 'universal',
  },
  system_api: {
    nodeType: 'system_api',
    label: 'System API',
    icon: ApiIcon,
    category: 'actions',
    description: 'Wywołaj API systemu',
    color: '#ff9800',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { apiMethod: '', parameters: {} },
    hasScript: false,
    runtime: 'universal',
  },
  if_else: {
    nodeType: 'if_else',
    label: 'If/Else',
    icon: CallSplitIcon,
    category: 'logic',
    description: 'Warunkowe rozgałęzienie',
    color: '#2196f3',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [
      { id: 'true', name: 'True', direction: 'output', dataType: 'flow' },
      { id: 'false', name: 'False', direction: 'output', dataType: 'flow' },
    ],
    defaultConfig: { condition: '' },
    hasScript: false,
    runtime: 'universal',
  },
  switch: {
    nodeType: 'switch',
    label: 'Switch',
    icon: AltRouteIcon,
    category: 'logic',
    description: 'Wielokierunkowe rozgałęzienie',
    color: '#2196f3',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [
      { id: 'case_0', name: 'Case 1', direction: 'output', dataType: 'flow' },
      { id: 'default', name: 'Default', direction: 'output', dataType: 'flow' },
    ],
    defaultConfig: { expression: '', cases: [''] },
    hasScript: false,
    runtime: 'universal',
  },
  for_loop: {
    nodeType: 'for_loop',
    label: 'For Loop',
    icon: LoopIcon,
    category: 'logic',
    description: 'Pętla iteracyjna',
    color: '#2196f3',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [
      { id: 'body', name: 'Body', direction: 'output', dataType: 'flow' },
      { id: 'done', name: 'Done', direction: 'output', dataType: 'flow' },
    ],
    defaultConfig: { count: 10, indexVariable: 'i' },
    hasScript: false,
    runtime: 'universal',
  },
  while_loop: {
    nodeType: 'while_loop',
    label: 'While Loop',
    icon: RepeatIcon,
    category: 'logic',
    description: 'Pętla warunkowa',
    color: '#2196f3',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [
      { id: 'body', name: 'Body', direction: 'output', dataType: 'flow' },
      { id: 'done', name: 'Done', direction: 'output', dataType: 'flow' },
    ],
    defaultConfig: { condition: '', maxIterations: 1000 },
    hasScript: false,
    runtime: 'universal',
  },
  read_variable: {
    nodeType: 'read_variable',
    label: 'Read Variable',
    icon: VisibilityIcon,
    category: 'data',
    description: 'Odczytaj zmienną',
    color: '#9c27b0',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [
      { id: 'out', name: 'Out', direction: 'output', dataType: 'flow' },
      { id: 'value', name: 'Value', direction: 'output', dataType: 'any' },
    ],
    defaultConfig: { variableName: '' },
    hasScript: false,
    runtime: 'universal',
  },
  write_variable: {
    nodeType: 'write_variable',
    label: 'Write Variable',
    icon: EditIcon,
    category: 'data',
    description: 'Zapisz zmienną',
    color: '#9c27b0',
    defaultInputs: [
      { id: 'in', name: 'In', direction: 'input', dataType: 'flow' },
      { id: 'value', name: 'Value', direction: 'input', dataType: 'any' },
    ],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { variableName: '', value: '' },
    hasScript: false,
    runtime: 'universal',
  },
  log: {
    nodeType: 'log',
    label: 'Log',
    icon: TerminalIcon,
    category: 'output',
    description: 'Loguj wiadomość',
    color: '#607d8b',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { message: '', level: 'info' },
    hasScript: false,
    runtime: 'universal',
  },
  notification: {
    nodeType: 'notification',
    label: 'Notification',
    icon: NotificationsIcon,
    category: 'output',
    description: 'Pokaż powiadomienie',
    color: '#607d8b',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { message: '', severity: 'info' },
    hasScript: false,
    runtime: 'client',
  },
  llm_call: {
    nodeType: 'llm_call',
    label: 'LLM Call',
    icon: PsychologyIcon,
    category: 'ai',
    description: 'Wywołaj model AI (OpenAI, Anthropic, Ollama)',
    color: '#e91e63',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { prompt: '', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 2048, useScript: false },
    hasScript: true,
    runtime: 'universal',
  },
  tts: {
    nodeType: 'tts',
    label: 'Text to Speech',
    icon: RecordVoiceOverIcon,
    category: 'ai',
    description: 'Odczytaj tekst na głos (TTS)',
    color: '#00bcd4',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { text: '', useScript: false, voice: '', speed: 1.0 },
    hasScript: true,
    runtime: 'client',
  },
  stt: {
    nodeType: 'stt',
    label: 'Speech to Text',
    icon: MicIcon,
    category: 'ai',
    description: 'Zamień mowę na tekst (STT)',
    color: '#00bcd4',
    defaultInputs: [{ id: 'in', name: 'In', direction: 'input', dataType: 'flow' }],
    defaultOutputs: [{ id: 'out', name: 'Out', direction: 'output', dataType: 'flow' }],
    defaultConfig: { language: '' },
    hasScript: false,
    runtime: 'client',
  },
  comment: {
    nodeType: 'comment',
    label: 'Comment',
    icon: CommentIcon,
    category: 'utility',
    description: 'Komentarz (nie wykonywany)',
    color: '#bdbdbd',
    defaultInputs: [],
    defaultOutputs: [],
    defaultConfig: { text: '' },
    hasScript: false,
    runtime: 'universal',
  },
};

export const CATEGORY_LABELS: Record<AutomateNodeCategory, string> = {
  triggers: 'Triggery',
  actions: 'Akcje',
  logic: 'Logika',
  data: 'Dane',
  output: 'Wyjście',
  ai: 'AI',
  utility: 'Narzędzia',
};

export const CATEGORY_ORDER: AutomateNodeCategory[] = [
  'triggers', 'actions', 'logic', 'data', 'output', 'ai', 'utility',
];
