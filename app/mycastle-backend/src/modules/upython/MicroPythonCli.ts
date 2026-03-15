export interface DeployOptions {
  port: string;
  files: Array<{ localPath: string; remoteName: string }>;
}

export interface DeployResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export interface MicroPythonCli {
  deploy(options: DeployOptions): Promise<DeployResult>;
}
