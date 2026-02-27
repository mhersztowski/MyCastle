export interface TerminalMessage {
  type: 'auth' | 'input' | 'resize' | 'output' | 'exit' | 'error';
  data?: string;
  cols?: number;
  rows?: number;
  code?: number;
  ticket?: string;
}

export interface TerminalPanelProps {
  /** WebSocket URL (auto-detected from window.location if omitted) */
  wsUrl?: string;
  /** JWT token for authentication */
  token?: string;
}
