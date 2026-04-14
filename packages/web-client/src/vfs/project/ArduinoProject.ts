import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

/** boardProfileKey → Arduino-CLI FQBN */
const BOARD_FQBN: Record<string, string> = {
  esp32_devkitc:  'esp32:esp32:esp32',
  esp32s3_pico:   'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=8M,PSRAM=opi',
  esp32s3_zero:   'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=4M,PSRAM=opi',
};

interface DoneEvent {
  success: boolean;
  exitCode?: number;
  error?: string;
}

export class ArduinoProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Arduino'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'compile',       label: 'Compile',      description: 'Compile the sketch',          hasOutput: true, shortcut: 'F7' },
      { id: 'flash',         label: 'Flash',         description: 'Upload binary to device',     hasOutput: true, shortcut: 'F8' },
      { id: 'compile-flash', label: 'Build & Flash', description: 'Compile then upload',         hasOutput: true },
      { id: 'clean',         label: 'Clean',         description: 'Remove build artifacts',      hasOutput: false },
    ];
  }

  async execute(actionId: string, selectedPath: string | null, onOutput: (l: string) => void, signal: AbortSignal) {
    const fqbn = this.context.boardProfileKey ? BOARD_FQBN[this.context.boardProfileKey] : undefined;
    if (!fqbn && actionId !== 'clean') {
      onOutput(`Error: unknown board profile "${this.context.boardProfileKey ?? '(none)'}"`);
      return { success: false };
    }

    const sketchName = this.deriveSketchName(selectedPath);
    if (!sketchName && actionId !== 'clean') {
      onOutput('Error: could not determine sketch name from selected path.');
      onOutput('Select a file inside the sketches/ directory.');
      return { success: false };
    }

    const base = `/users/${encodeURIComponent(this.deps.userName)}/project-arduino/${encodeURIComponent(this.context.id)}`;

    if (actionId === 'compile' || actionId === 'compile-flash') {
      onOutput(`> Compiling ${sketchName} (${fqbn}) …`);
      const done = await this.apiGetSSE<DoneEvent>(
        `${base}/compile`,
        { sketchName: sketchName!, fqbn: fqbn! },
        onOutput,

         

         
        signal,
      );
      if (done.error) return { success: false, error: done.error };
      if (!done.success) return { success: false };
      if (actionId === 'compile') return { success: true };
    }

    if (actionId === 'flash' || actionId === 'compile-flash') {
      const port = this.promptPort();
      if (!port) return { success: false, error: 'Flash cancelled (no port)' };
      onOutput(`> Uploading to ${port} …`);
      const done = await this.apiGetSSE<DoneEvent>(
        `${base}/upload`,
        { sketchName: sketchName!, fqbn: fqbn!, port },
        onOutput,
        signal,
      );
      if (done.error) return { success: false, error: done.error };
      return { success: done.success };
    }

    if (actionId === 'clean') {
      onOutput('> Clean not yet implemented server-side.');
      return { success: true };
    }

    return { success: false, error: `Unknown action: ${actionId}` };
  }
}
