export interface BoardInfo {
  fqbn: string;
  name: string;
}

export interface MinisConfig {
  deviceName: string;   // human name used in MQTT topics
  serialNumber: string; // hardware SN, used internally for build tracking
  wifiSsid: string;
  wifiPassword: string;
  architectureJson: string;
}

export interface CompileOptions {
  fqbn: string;
  sketchPath: string;
  configFilePath: string;
  outputDir: string;
  buildDir: string;
  verbose?: boolean;
  /** If provided, called with each stdout/stderr chunk in real time (SSE streaming). */
  onChunk?: (chunk: string) => void;
}

export interface CompileResult {
  success: boolean;
  output: string;
  exitCode: number;
  outputFiles?: string[];
}

export interface PortInfo {
  address: string;
  protocol: string;
  boardName?: string;
}

export interface UploadOptions {
  fqbn: string;
  sketchPath: string;
  port: string;
  configFilePath: string;
  verbose?: boolean;
  /** If provided, called with each stdout/stderr chunk in real time (SSE streaming). */
  onChunk?: (chunk: string) => void;
}

export interface UploadResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export interface ArduinoCli {
  listBoards(): Promise<BoardInfo[]>;
  compile(options: CompileOptions): Promise<CompileResult>;
  listPorts(): Promise<PortInfo[]>;
  upload(options: UploadOptions): Promise<UploadResult>;
  libInstall(lib: { name: string; version?: string; url?: string }, configFilePath: string): Promise<void>;
}
