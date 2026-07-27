export interface DeployOptions {
  port: string;
  files: Array<{ localPath: string; remoteName: string }>;
  /** If provided, called with each stdout/stderr chunk in real time (SSE streaming). */
  onChunk?: (chunk: string) => void;
}

export interface DeployResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export interface MicroPythonCli {
  deploy(options: DeployOptions): Promise<DeployResult>;
}
