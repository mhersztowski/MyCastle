import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

export interface PygameBuildResult {
  success: boolean;
  output: string;
}

export interface PygameServiceConfig {
  /** Path to pygbag executable. Defaults to 'pygbag'. */
  pygbagPath?: string;
  rootDir: string;
  /** Docker container name — uses `docker exec`. */
  dockerContainer?: string;
  /** Docker image name — uses `docker run --rm` (preferred, no persistent container needed). */
  dockerImage?: string;
  /** Path to data dir inside the container. Defaults to '/workspace/data'. */
  dockerDataDir?: string;
}

export class PygameService {
  private readonly pygbagPath: string;
  private readonly rootDir: string;
  private readonly dockerContainer: string | undefined;
  private readonly dockerImage: string | undefined;
  private readonly dockerDataDir: string;

  constructor(config: PygameServiceConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.pygbagPath = config.pygbagPath ?? 'pygbag';
    this.dockerContainer = config.dockerContainer;
    this.dockerImage = config.dockerImage;
    this.dockerDataDir = config.dockerDataDir ?? '/workspace/data';
    const mode = this.dockerImage ? `docker run:${this.dockerImage}` : this.dockerContainer ? `docker exec:${this.dockerContainer}` : this.pygbagPath;
    console.log(`PygameService: mode=${mode}`);
  }

  sketchDir(userName: string, projectId: string, sketchName: string): string {
    return path.join(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'sketches', sketchName);
  }

  webBuildDir(userName: string, projectId: string, sketchName: string): string {
    return path.join(this.sketchDir(userName, projectId, sketchName), 'build', 'web');
  }

  private async injectBackButton(webBuildDir: string): Promise<void> {
    const indexPath = path.join(webBuildDir, 'index.html');
    try {
      let html = await fs.promises.readFile(indexPath, 'utf-8');
      if (html.includes('data-pygbag-back-btn')) return; // already injected
      const btn = `
<style data-pygbag-back-btn>
  #pygbag-back {
    position: fixed; top: 8px; left: 8px; z-index: 99999;
    background: rgba(0,0,0,0.55); color: #fff;
    border: none; border-radius: 6px;
    padding: 6px 14px; font-size: 15px; cursor: pointer;
    font-family: sans-serif; line-height: 1.4;
  }
  #pygbag-back:hover { background: rgba(0,0,0,0.8); }
</style>
<button id="pygbag-back" onclick="window.history.length>1?window.history.back():window.close()">&#8592; Back</button>`;
      html = html.replace('<body>', '<body>' + btn);
      await fs.promises.writeFile(indexPath, html, 'utf-8');
    } catch {
      // Non-critical — skip if index.html not found
    }
  }

  webBuildExists(userName: string, projectId: string, sketchName: string): boolean {
    try {
      fs.accessSync(path.join(this.webBuildDir(userName, projectId, sketchName), 'index.html'));
      return true;
    } catch {
      return false;
    }
  }

  async build(userName: string, projectId: string, sketchName: string): Promise<PygameBuildResult> {
    const sketchDir = this.sketchDir(userName, projectId, sketchName);
    // Pygbag requires the entry point to be named main.py
    const sketchFile = 'main.py';

    try {
      await fs.promises.access(path.join(sketchDir, sketchFile));
    } catch {
      return { success: false, output: `Sketch file not found: ${sketchFile} (build must provide code first)` };
    }

    let cmd: string;
    let args: string[];

    const rel = path.relative(this.rootDir, sketchDir).split(path.sep).join('/');
    const containerWorkDir = `${this.dockerDataDir}/${rel}`;

    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;

    if (this.dockerImage) {
      cmd = 'docker';
      args = ['run', '--rm', '--user', `${uid}:${gid}`, '-w', containerWorkDir, '-v', `${this.rootDir}:${this.dockerDataDir}`, this.dockerImage, 'pygbag', '--build', sketchFile];
    } else if (this.dockerContainer) {
      cmd = 'docker';
      args = ['exec', '--user', `${uid}:${gid}`, '-w', containerWorkDir, this.dockerContainer, 'pygbag', '--build', sketchFile];
    } else {
      cmd = this.pygbagPath;
      args = ['--build', sketchFile];
    }

    const cmdLine = `$ ${cmd} ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd: this.dockerContainer ? undefined : sketchDir,
        maxBuffer: MAX_BUFFER,
        timeout: 120_000,
      });
      const output = [stdout, stderr].filter(Boolean).join('');
      await this.injectBackButton(this.webBuildDir(userName, projectId, sketchName));
      return { success: true, output: cmdLine + output };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      const output = [e.stdout, e.stderr, e.message].filter(Boolean).join('');
      return { success: false, output: cmdLine + output };
    }
  }
}
