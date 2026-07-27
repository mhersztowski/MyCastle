import { MqttServer, FileSystem, JwtService, PasswordService, ApiKeyService, DataSource, ArduinoService, ArduinoWasmBuilder, MicroPythonService, PygameService, PicoSdkService } from '@mhersztowski/core-backend';
import * as cron from 'node-cron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { FileChangeEvent } from '@mhersztowski/core-backend';
import { OcrService } from './modules/ocr/OcrService';
import { AutomateService } from './modules/automate';
import { SchedulerService, DriveScriptScheduler } from './modules/scheduler';
import { MycastleHttpServer } from './MycastleHttpServer.js';
import { IotService } from './modules/iot/IotService.js';
import { TerminalService } from './modules/terminal/TerminalService.js';
import { LspProxyService } from './modules/lsp/LspProxyService.js';
import { PluginService } from './modules/plugins/PluginService.js';
import { BackendPluginService } from './modules/plugins/BackendPluginService.js';
import { SecretsService } from './modules/secrets/SecretsService.js';
import { GitService } from './modules/git/GitService.js';
import { IotServer, type IMqttTransport } from '@mhersztowski/server-logic';

export interface AppConfig {
  httpPort: number;
  mqttPort: number | null;
  rootDir: string;
  staticDir: string | null;
  jwtSecret: string;
  arduinoCliLocalPath?: string;
  arduinoCliDockerName?: string;
  arduinoCliDockerImage?: string;
  upythonCliLocalPath?: string;
  upythonDockerName?: string;
  upythonDockerImage?: string;
  pygbagPath?: string;
  pygameDockerName?: string;
  pygameDockerImage?: string;
  /** Base path for user PIM data, e.g. 'Minis/Users/marcin'. Defaults to env USER_DATA_PATH. */
  userDataPath?: string;
  /** Host-side path to the data directory, used when backend runs inside Docker and spawns
   *  `docker run` via the Docker socket. If unset, rootDir is used (correct for non-Docker deployments). */
  hostDataDir?: string;
}

export class App {
  private static _instance: App;

  readonly fileSystem: FileSystem;
  readonly ocrService: OcrService;
  readonly dataSource: DataSource;
  readonly automateService: AutomateService;
  readonly schedulerService: SchedulerService;
  readonly driveScriptScheduler: DriveScriptScheduler;
  readonly httpServer: MycastleHttpServer;
  readonly iotService: IotService;
  readonly arduinoService: ArduinoService;
  readonly arduinoWasmBuilder: ArduinoWasmBuilder | null;
  readonly upythonService: MicroPythonService;
  readonly pygameService: PygameService;
  readonly picoSdkService: PicoSdkService | null;
  readonly pluginService: PluginService;
  readonly backendPluginService: BackendPluginService;
  readonly secretsService: SecretsService;
  readonly gitService: GitService;
  private _mqttServer!: MqttServer;
  // Only set when SERVER_LOGIC_AUTOSTART=true. Otherwise the server-logic layer
  // is expected to be started from a user backend script.
  serverLogic?: IotServer;
  private terminalService!: TerminalService;
  private lspProxyService!: LspProxyService;
  private jwtService: JwtService;
  private apiKeyService: ApiKeyService;
  readonly config: AppConfig;

  private readonly sharedPort: boolean;

  get mqttServer(): MqttServer {
    if (!this._mqttServer) {
      throw new Error('MqttServer not available — call init() first');
    }
    return this._mqttServer;
  }

  private constructor(config: AppConfig) {
    this.config = config;
    this.sharedPort = !config.mqttPort || config.mqttPort === config.httpPort;

    const userDataPath = config.userDataPath ?? process.env.USER_DATA_PATH ?? '';
    this.fileSystem = new FileSystem(config.rootDir);
    this.ocrService = new OcrService();
    this.dataSource = new DataSource(this.fileSystem, userDataPath);
    this.automateService = new AutomateService(this.fileSystem, this.dataSource, userDataPath);
    this.schedulerService = new SchedulerService(this.automateService, this.fileSystem);
    this.iotService = new IotService(config.rootDir);
    this.jwtService = new JwtService(config.jwtSecret);
    this.apiKeyService = new ApiKeyService(this.fileSystem, 'Minis/Admin/ApiKeys.json');
    this.arduinoService = new ArduinoService({
      localPath: config.arduinoCliLocalPath,
      dockerContainer: config.arduinoCliDockerName,
      dockerImage: config.arduinoCliDockerImage,
      rootDir: config.rootDir,
      hostDataDir: config.hostDataDir,
    });
    this.upythonService = new MicroPythonService({
      localPath: config.upythonCliLocalPath,
      dockerContainer: config.upythonDockerName,
      dockerImage: config.upythonDockerImage,
      rootDir: config.rootDir,
      hostDataDir: config.hostDataDir,
    });
    this.pygameService = new PygameService({
      pygbagPath: config.pygbagPath,
      dockerContainer: config.pygameDockerName,
      dockerImage: config.pygameDockerImage,
      rootDir: config.rootDir,
      hostDataDir: config.hostDataDir,
    });

    const picoSdkDockerImage = process.env.PICOSDK_DOCKER_IMAGE;
    this.picoSdkService = picoSdkDockerImage
      ? new PicoSdkService({ dockerImage: picoSdkDockerImage, rootDir: config.rootDir, hostDataDir: config.hostDataDir })
      : null;
    if (!picoSdkDockerImage) console.log('PicoSdk service: not configured (set PICOSDK_DOCKER_IMAGE)');

    const arduinoWasmDockerImage = process.env.ARDUINO_WASM_DOCKER_IMAGE;
    const hostDataDir = config.hostDataDir ? path.resolve(config.hostDataDir) : path.resolve(config.rootDir);
    this.arduinoWasmBuilder = arduinoWasmDockerImage
      ? new ArduinoWasmBuilder(arduinoWasmDockerImage, hostDataDir, path.resolve(config.rootDir))
      : null;
    if (!arduinoWasmDockerImage) console.log('Arduino WASM builder: not configured (set ARDUINO_WASM_DOCKER_IMAGE)');

    this.pluginService = new PluginService(config.rootDir);
    this.backendPluginService = new BackendPluginService(config.rootDir);
    this.secretsService = new SecretsService(config.rootDir);
    this.driveScriptScheduler = new DriveScriptScheduler(config.rootDir);
    this.gitService = new GitService(config.rootDir, this.secretsService);

    this.httpServer = new MycastleHttpServer(
      config.httpPort,
      this.fileSystem,
      this.jwtService,
      this.apiKeyService,
      this.iotService,
      config.staticDir || undefined,
      config.rootDir,
      this.arduinoService,
      this.upythonService,
      this.pygameService,
      this.picoSdkService,
      this.pluginService,
      this.backendPluginService,
      this.secretsService,
      this.arduinoWasmBuilder,
      this.driveScriptScheduler,
      this.gitService,
    );
  }

  static create(config: AppConfig): App {
    if (App._instance) {
      throw new Error('App already created');
    }
    App._instance = new App(config);
    return App._instance;
  }

  static get instance(): App {
    if (!App._instance) {
      throw new Error('App not created yet — call App.create() first');
    }
    return App._instance;
  }

  async init(): Promise<void> {
    await this.fileSystem.initialize();
    console.log(`FileSystem initialized with root: ${this.config.rootDir}`);

    // Globalny katalog media (`data/public` we frontendzie = `<ROOT_DIR>/public`) —
    // używany przez picker media edytora Markdown. `data/` jest gitignorowane, więc
    // na świeżej instalacji/deployu folderu brakuje; tworzymy go, jeśli nie istnieje.
    const publicDir = path.join(this.config.rootDir, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      console.log(`Created public media directory: ${publicDir}`);
    }

    // Seed default admin user if no users exist
    await this.seedDefaultAdmin();

    // Per-user katalog media edytora Markdown: <ROOT_DIR>/Minis/Users/{u}/drive/public/files
    // (obraz/wideo/audio/pliki). `data/` jest gitignorowane → tworzymy brakujące przy starcie.
    await this.ensureUserMediaDirs();

    await this.apiKeyService.load();
    console.log('API key service loaded');

    await this.secretsService.initialize();
    console.log('Secrets service initialized');

    await this.dataSource.initialize();
    console.log('DataSource initialized:', this.dataSource.getStats());

    await this.automateService.initialize();
    console.log(`AutomateService initialized: ${this.automateService.getAllFlows().length} flows`);

    await this.schedulerService.initialize();
    console.log(`SchedulerService initialized: ${this.schedulerService.getActiveJobs().length} active schedules`);

    await this.driveScriptScheduler.loadAllUsers();
    console.log(`DriveScriptScheduler initialized: ${this.driveScriptScheduler.activeCount()} active cron scripts`);
    const startupRan = await this.driveScriptScheduler.runStartupAll();
    if (startupRan > 0) console.log(`DriveScriptScheduler: ran ${startupRan} startup script(s)`);

    // OCR initialization is non-blocking
    try {
      await this.ocrService.initialize();
      console.log('OCR Service initialized');
    } catch (ocrError) {
      console.warn('OCR Service failed to initialize (receipt OCR will be unavailable):', ocrError);
    }

    // Start HTTP server, then attach MQTT on same port
    await this.httpServer.start();
    // Non-blocking one-time migration: backfill project.json files for existing projects
    this.httpServer.migrateProjectJsonFiles().catch(err =>
      console.warn('migrateProjectJson failed:', err),
    );
    this._mqttServer = new MqttServer(this.fileSystem, this.httpServer.getHttpServer());

    // MQTT authentication: anonymous allowed, or API key, JWT token, username+password
    this._mqttServer.setAuthenticate(async (_clientId, username, password) => {
      if (!username && !password) return true; // allow anonymous (web client)
      if (ApiKeyService.isApiKey(password)) {
        return this.apiKeyService.verify(password) !== null;
      }
      const payload = this.jwtService.verify(password);
      if (payload) return true;
      try {
        const data = await this.fileSystem.readFile('Minis/Admin/Users.json');
        const users = (JSON.parse(data.content) as { items: Array<{ name: string; password: string }> }).items || [];
        const user = users.find(u => u.name === username);
        if (!user) return false;
        return PasswordService.verify(password, user.password);
      } catch {
        return false;
      }
    });

    // Attach terminal WebSocket service
    this.terminalService = new TerminalService(this.jwtService, this.apiKeyService);
    this.terminalService.attach(this.httpServer.getHttpServer());
    this.httpServer.setTerminalService(this.terminalService);

    // Attach LSP proxy (marksman) WebSocket service
    this.lspProxyService = new LspProxyService(this.jwtService, this.config.rootDir);
    this.lspProxyService.attach(this.httpServer.getHttpServer());

    if (this.sharedPort) {
      await this._mqttServer.start();
      console.log(`Server started on port ${this.config.httpPort} (HTTP + MQTT WebSocket at /mqtt + Terminal at /ws/terminal)`);
    } else {
      await this._mqttServer.start(this.config.mqttPort!);
      console.log(`MQTT Server started on port ${this.config.mqttPort}`);
      console.log(`HTTP Server started on port ${this.config.httpPort}`);
    }

    // Plain TCP MQTT listener for embedded clients (umqtt.simple, standard MQTT)
    const mqttTcpPort = process.env.MQTT_TCP_PORT ? parseInt(process.env.MQTT_TCP_PORT, 10) : 1884;
    await this._mqttServer.startTcp(mqttTcpPort);
    console.log(`MQTT TCP listener started on port ${mqttTcpPort}`);

    if (this.config.staticDir) {
      console.log(`Serving frontend from: ${this.config.staticDir}`);
    }

    // Forward file changes to MQTT clients
    this.fileSystem.on('fileChanged', async (event: FileChangeEvent) => {
      this._mqttServer.broadcastFileChanged(event.path, event.action);

      if (event.path.replace(/\\/g, '/') === 'data/automations.json') {
        await this.automateService.reload();
        console.log(`AutomateService reloaded: ${this.automateService.getAllFlows().length} flows`);
        await this.schedulerService.reload();
        console.log(`SchedulerService reloaded: ${this.schedulerService.getActiveJobs().length} active schedules`);
      }

      if (event.path.endsWith('.automate.json')) {
        await this.schedulerService.reload();
        console.log(`SchedulerService reloaded (file: ${event.path}): ${this.schedulerService.getActiveJobs().length} active schedules`);
      }
    });

    // Wire IoT service to MQTT
    this.iotService.start((topic, payload) => {
      this._mqttServer.publishMessage(topic, payload);
    });
    this._mqttServer.onMessage((topic, payload) => {
      if (topic.startsWith('minis/')) {
        this.iotService.handleMqttMessage(topic, payload);
      }
    });
    console.log('IoT service started (SQLite + MQTT)');

    // Server API dla skryptów Drive: HTTP (POST /api/server/cmd) + kanał MQTT
    // (/server/cmd → /client/{clientId}). Uruchamiane przy każdym starcie backendu.
    const serverApi = this.httpServer.getServerApi();
    if (serverApi) {
      serverApi.attachMqtt(this._mqttServer);
      console.log('Server API started (HTTP /api/server/cmd + MQTT /server/cmd → /client/{clientId})');
    } else {
      console.warn('Server API not started — rootDir not configured');
    }

    // Server-logic layer (server/user/client MQTT control plane).
    // Auto-start is OFF by default — run it yourself from a backend script
    // (`import 'mycastle/packages/server-logic/src/index.ts'`). The Server Logic
    // client page stays available regardless; it just shows data once some
    // IotServer instance is publishing on the MQTT bus.
    if (process.env.SERVER_LOGIC_AUTOSTART === 'true') {
      const serverLogicTransport: IMqttTransport = {
        publish: (topic, payload) => this._mqttServer.publishMessage(topic, payload),
        subscribe: (handler) => this._mqttServer.onMessage(handler),
      };
      this.serverLogic = new IotServer({
        transport: serverLogicTransport,
        staleClientMs: 60_000,
        cronScheduler: { schedule: (expr, fn) => cron.schedule(expr, () => void fn()) },
        // Stream log/activity/clients on the server outbox for the Server Logic page.
        broadcastLog: true,
        broadcastActivity: true,
        broadcastClients: true,
      });
      this.serverLogic.start();
      console.log('Server logic started (server/user/client MQTT topics)');
    } else {
      console.log('Server logic auto-start disabled (set SERVER_LOGIC_AUTOSTART=true to enable) — start it from a backend script instead');
    }

    // Load user backend plugins (build + activate; routes dispatched by the HTTP server)
    try {
      await this.backendPluginService.loadAllUsers();
    } catch (err) {
      console.warn('BackendPluginService failed to load plugins:', err);
    }

    this._mqttServer.setAutomateService(this.automateService);

    // Nightly cleanup of orphaned project directories (every day at 03:00 UTC)
    cron.schedule('0 3 * * *', () => { void this.runOrphanProjectsCleanup(); });
    console.log('Scheduled nightly orphan-projects cleanup at 03:00 UTC');

    // Nightly snapshot of user data — safety net against accidental
    // overwrites (e.g. sync:push:force from a stale local). Tarball goes
    // to a SIBLING directory of the data dir so a rogue `rm -rf data/`
    // doesn't take the backups with it.
    cron.schedule('30 3 * * *', () => { void this.runUsersBackup(); });
    console.log('Scheduled nightly users backup at 03:30 UTC');
    // Run one immediately on startup too — gives us a baseline snapshot
    // before any code path (including the cleanup above, plugins, etc.)
    // gets a chance to touch user data. Cheap (gzip on tens of MB).
    void this.runUsersBackup();

    // Graceful shutdown on signals
    const shutdownHandler = async () => {
      await this.shutdown();
      process.exit(0);
    };
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    console.log('App initialized successfully');
  }

  private async seedDefaultAdmin(): Promise<void> {
    const usersPath = 'Minis/Admin/Users.json';
    try {
      const data = await this.fileSystem.readFile(usersPath);
      const parsed = JSON.parse(data.content);
      if (parsed.items && parsed.items.length > 0) return;
    } catch {
      // File doesn't exist — create it
    }

    const hashedPassword = await PasswordService.hash('admin');
    const defaultAdmin = {
      items: [{
        id: crypto.randomUUID(),
        name: 'admin',
        password: hashedPassword,
        isAdmin: true,
        roles: [],
        type: 'user',
      }],
    };
    await this.fileSystem.writeFile(usersPath, JSON.stringify(defaultAdmin, null, 2));
    console.log('Seeded default admin user (admin/admin) — change password after first login!');
  }

  /** Zapewnia katalog media edytora Markdown dla każdego użytkownika (per-user). */
  private async ensureUserMediaDirs(): Promise<void> {
    try {
      const data = await this.fileSystem.readFile('Minis/Admin/Users.json');
      const parsed = JSON.parse(data.content) as { items?: Array<{ name?: string }> };
      for (const u of parsed.items ?? []) {
        if (!u.name || !/^[A-Za-z0-9_-]+$/.test(u.name)) continue;
        const dir = path.join(this.config.rootDir, 'Minis', 'Users', u.name, 'drive', 'public', 'files');
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created user media directory: ${dir}`);
        }
      }
    } catch (err) {
      console.warn('Could not ensure per-user media directories:', err instanceof Error ? err.message : err);
    }
  }

  private async runOrphanProjectsCleanup(): Promise<void> {
    try {
      const data = await this.fileSystem.readFile('Minis/Admin/Users.json');
      const parsed = JSON.parse(data.content) as { items?: Array<{ name: string }> };
      const users = parsed.items ?? [];
      let totalRemoved = 0;
      for (const user of users) {
        const result = await this.httpServer.cleanupOrphanProjectsForUser(user.name);
        if (result.removed.length > 0) {
          console.log(`Cleanup [${user.name}]: removed ${result.removed.length} orphan dir(s): ${result.removed.join(', ')}`);
          totalRemoved += result.removed.length;
        }
      }
      console.log(`Nightly cleanup done — ${totalRemoved} orphaned director${totalRemoved === 1 ? 'y' : 'ies'} removed across ${users.length} user(s)`);
    } catch (err) {
      console.warn('Nightly cleanup failed:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * Snapshot `Minis/Users/` to a tarball under `BACKUP_DIR` (defaults to
   * `<rootDir>/../backups`). Sibling of the data dir so a rogue `rm -rf`
   * on data/ doesn't take the backups with it.
   *
   * Strategy is intentionally process-shell `tar -czf`:
   *   - one binary, well-tested, doesn't pull node-tar / archiver into bundle
   *   - native streaming → minimal memory footprint even on 1GB user trees
   *   - timestamps in archive name → trivial retention sort
   *
   * Retention: keep last BACKUP_KEEP (default 14) archives. Older are
   * removed after a successful new backup — never before, so a failed
   * backup can't shrink the safety net.
   *
   * Added after the 2026-06 incident where a stale `sync:push:force`
   * deleted server-side drive content. Even without backup mounting,
   * `/data/../backups/` is still bind-mounted on the host (sibling of
   * `/opt/mycastle-data`), so the operator can recover via `tar -xzf`.
   */
  private async runUsersBackup(): Promise<void> {
    const rootDir = this.config.rootDir;
    if (!rootDir) return;
    const usersDir = path.resolve(rootDir, 'Minis', 'Users');
    // Skip silently if there's nothing to back up yet (fresh install).
    try { await fs.promises.access(usersDir); } catch { return; }

    const backupDir = process.env.BACKUP_DIR
      || path.resolve(rootDir, '..', 'backups');
    try { await fs.promises.mkdir(backupDir, { recursive: true }); }
    catch (err) {
      console.warn('backup: cannot create backup dir', backupDir, err);
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archive = path.join(backupDir, `users-${stamp}.tar.gz`);

    await new Promise<void>((resolve, reject) => {
      // tar -czf <out> -C <parent> Users  → archive contains "Users/…"
      // relative paths, so an `tar -xzf` outside the original tree works.
      const proc = spawn('tar', ['-czf', archive, '-C', path.dirname(usersDir), path.basename(usersDir)]);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tar exited ${code}: ${stderr.trim()}`));
      });
      proc.on('error', reject);
    }).then(async () => {
      const stat = await fs.promises.stat(archive);
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
      console.log(`backup: snapshot OK → ${archive} (${sizeMB} MB)`);
      // Retention sweep — keep last N. Sort lexicographically (timestamps
      // are ISO so lexical order === chronological order).
      const keep = parseInt(process.env.BACKUP_KEEP || '14', 10);
      try {
        const all = (await fs.promises.readdir(backupDir))
          .filter(n => n.startsWith('users-') && n.endsWith('.tar.gz'))
          .sort();
        const remove = all.slice(0, Math.max(0, all.length - keep));
        for (const n of remove) {
          await fs.promises.unlink(path.join(backupDir, n));
        }
        if (remove.length > 0) {
          console.log(`backup: retention removed ${remove.length} old archive(s); keeping last ${keep}`);
        }
      } catch (err) {
        console.warn('backup: retention sweep failed:', err);
      }
    }).catch((err) => {
      // Non-fatal — the app keeps running even if backup fails. Just shout
      // loudly so the operator notices in logs.
      console.error('backup: snapshot FAILED:', err);
    });
  }

  async shutdown(): Promise<void> {
    console.log('App shutting down...');

    this.schedulerService.shutdown();
    this.driveScriptScheduler.shutdownAll();

    try {
      this.terminalService?.shutdown();
    } catch (err) {
      console.warn('Error stopping terminal service:', err);
    }

    try {
      this.lspProxyService?.shutdown();
    } catch (err) {
      console.warn('Error stopping LSP proxy service:', err);
    }

    try {
      this.iotService.stop();
    } catch (err) {
      console.warn('Error stopping IoT service:', err);
    }

    try {
      this.serverLogic?.stop();
    } catch (err) {
      console.warn('Error stopping server logic:', err);
    }

    try {
      await this.backendPluginService.shutdownAll();
    } catch (err) {
      console.warn('Error shutting down backend plugins:', err);
    }

    try {
      await this._mqttServer?.stop();
    } catch (err) {
      console.warn('Error stopping MQTT server:', err);
    }

    try {
      await this.httpServer.stop();
    } catch (err) {
      console.warn('Error stopping HTTP server:', err);
    }

    try {
      await this.ocrService.shutdown();
    } catch (err) {
      console.warn('Error shutting down OCR service:', err);
    }

    console.log('App shut down gracefully');
  }
}
