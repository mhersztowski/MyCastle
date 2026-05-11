import { MqttServer, FileSystem, JwtService, PasswordService, ApiKeyService, DataSource } from '@mhersztowski/core-backend';
import * as cron from 'node-cron';
import type { FileChangeEvent } from '@mhersztowski/core-backend';
import { OcrService } from './modules/ocr/OcrService';
import { AutomateService } from './modules/automate';
import { SchedulerService } from './modules/scheduler';
import { MycastleHttpServer } from './MycastleHttpServer.js';
import { IotService } from './modules/iot/IotService.js';
import { TerminalService } from './modules/terminal/TerminalService.js';
import { ArduinoService } from './modules/arduino/index.js';
import { MicroPythonService } from './modules/upython/index.js';
import { PygameService } from './modules/pygame/index.js';
import { PicoSdkService } from './modules/picosdk/index.js';
import { LspProxyService } from './modules/lsp/LspProxyService.js';
import { PluginService } from './modules/plugins/PluginService.js';

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
  readonly httpServer: MycastleHttpServer;
  readonly iotService: IotService;
  readonly arduinoService: ArduinoService;
  readonly upythonService: MicroPythonService;
  readonly pygameService: PygameService;
  readonly picoSdkService: PicoSdkService | null;
  readonly pluginService: PluginService;
  private _mqttServer!: MqttServer;
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

    this.pluginService = new PluginService(config.rootDir);

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

    // Seed default admin user if no users exist
    await this.seedDefaultAdmin();

    await this.apiKeyService.load();
    console.log('API key service loaded');

    await this.dataSource.initialize();
    console.log('DataSource initialized:', this.dataSource.getStats());

    await this.automateService.initialize();
    console.log(`AutomateService initialized: ${this.automateService.getAllFlows().length} flows`);

    await this.schedulerService.initialize();
    console.log(`SchedulerService initialized: ${this.schedulerService.getActiveJobs().length} active schedules`);

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

    this._mqttServer.setAutomateService(this.automateService);

    // Nightly cleanup of orphaned project directories (every day at 03:00 UTC)
    cron.schedule('0 3 * * *', () => { void this.runOrphanProjectsCleanup(); });
    console.log('Scheduled nightly orphan-projects cleanup at 03:00 UTC');

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

  async shutdown(): Promise<void> {
    console.log('App shutting down...');

    this.schedulerService.shutdown();

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
