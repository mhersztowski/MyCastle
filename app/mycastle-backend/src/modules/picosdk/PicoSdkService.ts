import * as path from 'path';
import { PicoSdkBuild } from './PicoSdkBuild.js';
import type { PicoSdkBuildResult } from './PicoSdkBuild.js';
import { PICO_BOARDS, DEFAULT_PICO_BOARD } from './boards.js';

export interface PicoSdkServiceConfig {
  dockerImage: string;
  rootDir: string;
  hostDataDir?: string;
}

export class PicoSdkService {
  private readonly build: PicoSdkBuild;
  private readonly rootDir: string;

  constructor(config: PicoSdkServiceConfig) {
    this.rootDir = path.resolve(config.rootDir);
    const hostDataDir = config.hostDataDir ? path.resolve(config.hostDataDir) : this.rootDir;
    this.build = new PicoSdkBuild(config.dockerImage, hostDataDir, this.rootDir);
    console.log(`PicoSdk service: docker image=${config.dockerImage}`);
  }

  async buildProject(
    userName: string,
    projectId: string,
    sketchName: string,
    boardKey: string = DEFAULT_PICO_BOARD,
    onData?: (chunk: string) => void,
  ): Promise<PicoSdkBuildResult> {
    const board = PICO_BOARDS[boardKey] ?? PICO_BOARDS[DEFAULT_PICO_BOARD];
    const sketchDir = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'sketches', sketchName);
    // Build dir includes boardKey so switching board gets a clean build
    const buildDir  = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'build', `${sketchName}-${boardKey}`);
    return this.build.build(sketchDir, buildDir, board.picoBoard, board.picoPlatform, onData);
  }

  /** Returns the path to the UF2 file for the given board. */
  uf2Path(userName: string, projectId: string, sketchName: string, boardKey: string = DEFAULT_PICO_BOARD): string {
    return path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'build', `${sketchName}-${boardKey}`, 'output.uf2');
  }
}
