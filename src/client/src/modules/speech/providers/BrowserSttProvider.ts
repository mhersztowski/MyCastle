/**
 * Browser STT Provider - Speech-to-Text via Web Speech API (SpeechRecognition)
 * Fallback provider that works without API keys
 */

import { SttProvider } from './SttProvider';
import { SttResponse } from '../models/SpeechModels';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const win = window as unknown as Record<string, unknown>;
  return (win.SpeechRecognition || win.webkitSpeechRecognition) as SpeechRecognitionConstructor | null;
}

export class BrowserSttProvider implements SttProvider {
  /**
   * Note: BrowserSttProvider ignores the audio Blob from SttRequest.
   * Instead it performs live recording via the SpeechRecognition API.
   */
  async transcribe(_request: unknown, config: Record<string, unknown>): Promise<SttResponse> {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      throw new Error('Browser Speech Recognition API is not supported');
    }

    const lang = config.lang as string || 'pl-PL';
    const continuous = config.continuous as boolean ?? false;
    const interimResults = config.interimResults as boolean ?? true;

    return new Promise<SttResponse>((resolve, reject) => {
      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.maxAlternatives = 1;

      let finalTranscript = '';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        reject(new Error(`Speech recognition error: ${event.error}`));
      };

      recognition.onend = () => {
        resolve({
          text: finalTranscript.trim(),
          language: lang,
        });
      };

      recognition.start();
    });
  }
}

/**
 * Live browser speech recognition - returns recognition instance for manual control.
 * Used by WakeWordService and MicrophoneButton.
 */
export function createBrowserRecognition(config: {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}): { start: () => void; stop: () => void; abort: () => void } | null {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = config.lang || 'pl-PL';
  recognition.continuous = config.continuous ?? false;
  recognition.interimResults = config.interimResults ?? true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      config.onResult?.(result[0].transcript, result.isFinal);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    config.onError?.(event.error);
  };

  recognition.onend = () => {
    config.onEnd?.();
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}
