import * as path from 'path';
import type { ArduinoCli, BoardInfo, PortInfo, CompileResult, MinisConfig, UploadResult } from './ArduinoCli.js';
import { ArduinoCliLocal } from './ArduinoCliLocal.js';
import { ArduinoCliDocker } from './ArduinoCliDocker.js';
import { ArduinoCliDockerRun } from './ArduinoCliDockerRun.js';
import { ArduinoProject } from './ArduinoProject.js';

export interface ArduinoServiceConfig {
  localPath?: string;
  dockerContainer?: string;
  dockerImage?: string;
  rootDir: string;
  /** Host path to data dir — used when backend runs in Docker and spawns `docker run` via socket.
   *  Defaults to rootDir (correct when running directly on the host). */
  hostDataDir?: string;
}

export class ArduinoService {
  private readonly cli: ArduinoCli | null;
  private readonly rootDir: string;

  constructor(config: ArduinoServiceConfig) {
    this.rootDir = path.resolve(config.rootDir);

    if (config.dockerImage) {
      const hostDataDir = config.hostDataDir ? path.resolve(config.hostDataDir) : this.rootDir;
      this.cli = new ArduinoCliDockerRun(config.dockerImage, hostDataDir, this.rootDir);
      console.log(`Arduino CLI: docker run mode (${config.dockerImage})`);
    } else if (config.dockerContainer) {
      this.cli = new ArduinoCliDocker(config.dockerContainer);
      console.log(`Arduino CLI: docker exec mode (${config.dockerContainer})`);
    } else if (config.localPath) {
      this.cli = new ArduinoCliLocal(config.localPath);
      console.log(`Arduino CLI: local mode (${config.localPath})`);
    } else {
      this.cli = null;
      console.log('Arduino CLI: not configured (set ARDUINO_CLI_DOCKER_IMAGE, ARDUINO_CLI_DOCKER_NAME, or ARDUINO_CLI_LOCAL_PATH)');
    }
  }

  get isAvailable(): boolean { return this.cli !== null; }

  async listBoards(): Promise<BoardInfo[]> {
    if (!this.cli) throw new Error('Arduino CLI not configured');
    return this.cli.listBoards();
  }

  async listPorts(): Promise<PortInfo[]> {
    if (!this.cli) throw new Error('Arduino CLI not configured');
    return this.cli.listPorts();
  }

  async compile(userName: string, projectId: string, sketchName: string, fqbn: string, minisConfig?: MinisConfig, libraries?: Array<{ name: string; version?: string; url?: string }>): Promise<CompileResult> {
    if (!this.cli) throw new Error('Arduino CLI not configured');
    const project = new ArduinoProject(this.cli, this.rootDir, userName, projectId, fqbn);
    return project.compile(sketchName, minisConfig, libraries);
  }

  async upload(userName: string, projectId: string, sketchName: string, fqbn: string, port: string): Promise<UploadResult> {
    if (!this.cli) throw new Error('Arduino CLI not configured');
    const project = new ArduinoProject(this.cli, this.rootDir, userName, projectId, fqbn);
    return project.upload(sketchName, port);
  }
}
