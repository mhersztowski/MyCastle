import { useState, useRef, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

import type { FileSystemProvider } from '@mhersztowski/core';
import type { AgentConfig, AgentMessage, AiProvider } from '../types';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenAiCompatibleProvider } from '../providers/OpenAiCompatibleProvider';
import { AgentEngine } from '../engine/AgentEngine';
import { ConfigPanel, loadAgentConfig } from './ConfigPanel';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

function createProvider(type: string): AiProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider();
    default:
      return new OpenAiCompatibleProvider();
  }
}

interface AgentPanelProps {
  provider: FileSystemProvider;
  defaultConfig?: Partial<AgentConfig>;
  onFileOpen?: (path: string) => void;
}

export function AgentPanel({ provider, defaultConfig, onFileOpen }: AgentPanelProps) {
  const [config, setConfig] = useState<AgentConfig>(() => loadAgentConfig(defaultConfig));
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const engineRef = useRef<AgentEngine | null>(null);

  // Create/update engine when config changes
  useEffect(() => {
    const aiProvider = createProvider(config.providerType);
    const providerConfig = config.providers[config.providerType];

    if (engineRef.current) {
      engineRef.current.updateConfig(
        aiProvider,
        providerConfig,
        config.maxIterations,
        config.temperature,
        config.maxTokens,
      );
    } else {
      engineRef.current = new AgentEngine(
        provider,
        {
          onMessage: (msg) => setMessages(prev => [...prev, msg]),
          onProcessingChange: setProcessing,
        },
        aiProvider,
        providerConfig,
        config.maxIterations,
        config.temperature,
        config.maxTokens,
      );
    }
  }, [config, provider]);

  const handleSend = useCallback(async (text: string) => {
    if (!engineRef.current) return;

    const providerConfig = config.providers[config.providerType];
    if (!providerConfig.apiKey && config.providerType !== 'ollama') {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Please configure your API key in the Configuration panel above.',
        timestamp: Date.now(),
      }]);
      return;
    }

    try {
      await engineRef.current.process(text);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      }]);
      setProcessing(false);
    }
  }, [config]);

  const handleClear = useCallback(() => {
    engineRef.current?.clearHistory();
    setMessages([]);
  }, []);

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column',
      height: '100%', bgcolor: '#252526', color: '#ccc',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center',
        px: 1, py: 0.5, borderBottom: '1px solid #3c3c3c',
      }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb', flexGrow: 1 }}>
          AI Agent
        </Typography>
        <IconButton
          size="small"
          title="Clear conversation"
          onClick={handleClear}
          sx={{ color: '#888', '&:hover': { bgcolor: '#3c3c3c' } }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 0.5C3.41 0.5 0.5 3.41 0.5 7s2.91 6.5 6.5 6.5 6.5-2.91 6.5-6.5S10.59 0.5 7 0.5zm3.18 8.82l-1.36 1.36L7 8.86l-1.82 1.82-1.36-1.36L5.64 7 3.82 5.18l1.36-1.36L7 5.64l1.82-1.82 1.36 1.36L8.36 7l1.82 1.82z" />
          </svg>
        </IconButton>
      </Box>

      {/* Config */}
      <ConfigPanel config={config} onChange={setConfig} />

      {/* Messages */}
      <ChatMessages messages={messages} processing={processing} onFileClick={onFileOpen} />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={processing} />
    </Box>
  );
}
