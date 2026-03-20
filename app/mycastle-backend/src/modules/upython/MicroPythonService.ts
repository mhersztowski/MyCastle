import * as path from 'path';
import type { MicroPythonCli } from './MicroPythonCli.js';
import { MicroPythonCliLocal } from './MicroPythonCliLocal.js';
import { MicroPythonCliDocker } from './MicroPythonCliDocker.js';
import { MicroPythonCliDockerRun } from './MicroPythonCliDockerRun.js';
import { MicroPythonProject } from './MicroPythonProject.js';
import type { UpythonLibrary } from './MicroPythonProject.js';
import type { DeployResult } from './MicroPythonCli.js';

export interface MicroPythonServiceConfig {
  localPath?: string;
  dockerContainer?: string;
  dockerImage?: string;
  rootDir: string;
}

export class MicroPythonService {
  private readonly cli: MicroPythonCli | null;
  private readonly rootDir: string;

  constructor(config: MicroPythonServiceConfig) {
    this.rootDir = path.resolve(config.rootDir);

    if (config.dockerImage) {
      this.cli = new MicroPythonCliDockerRun(config.dockerImage, this.rootDir);
      console.log(`MicroPython CLI: docker run mode (${config.dockerImage})`);
    } else if (config.dockerContainer) {
      this.cli = new MicroPythonCliDocker(config.dockerContainer);
      console.log(`MicroPython CLI: docker exec mode (${config.dockerContainer})`);
    } else if (config.localPath) {
      this.cli = new MicroPythonCliLocal(config.localPath);
      console.log(`MicroPython CLI: local mode (${config.localPath})`);
    } else {
      this.cli = null;
      console.log('MicroPython CLI: not configured (set UPYTHON_DOCKER_IMAGE, UPYTHON_DOCKER_NAME, or UPYTHON_CLI_LOCAL_PATH)');
    }
  }

  get isAvailable(): boolean { return this.cli !== null; }

  async deploy(userName: string, projectId: string, port: string, libraries?: UpythonLibrary[], inlineFiles?: Array<{ content: string; remoteName: string }>): Promise<DeployResult> {
    if (!this.cli) throw new Error('MicroPython CLI not configured');
    const project = new MicroPythonProject(this.cli, this.rootDir, userName, projectId);
    return project.deploy(port, libraries, inlineFiles);
  }
}
