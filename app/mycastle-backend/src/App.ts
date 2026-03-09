import { MqttServer, FileSystem, JwtService, PasswordService, ApiKeyService, DataSource } from '@mhersztowski/core-backend';
import type { FileChangeEvent } from '@mhersztowski/core-backend';
import { OcrService } from './modules/ocr/OcrService';
import { AutomateService } from './modules/automate';
import { SchedulerService } from './modules/scheduler';
import { MycastleHttpServer } from './MycastleHttpServer.js';
import { IotService } from './modules/iot/IotService.js';
import { TerminalService } from './modules/terminal/TerminalService.js';
import { ArduinoService } from './modules/arduino/index.js';

export interface AppConfig {
  httpPort: number;
  mqttPort: number | null;
  rootDir: string;
  staticDir: string | null;
  jwtSecret: string;
  arduinoCliLocalPath?: string;
  arduinoCliDockerName?: string;
  /** Base path for user PIM data, e.g. 'Minis/Users/marcin'. Defaults to env USER_DATA_PATH. */
  userDataPath?: string;
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
  private _mqttServer!: MqttServer;
  private terminalService!: TerminalService;
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
      rootDir: config.rootDir,
    });

    this.httpServer = new MycastleHttpServer(
      config.httpPort,
      this.fileSystem,
      this.jwtService,
      this.apiKeyService,
      this.iotService,
      config.staticDir || undefined,
      config.rootDir,
      this.arduinoService,
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

    if (this.sharedPort) {
      await this._mqttServer.start();
      console.log(`Server started on port ${this.config.httpPort} (HTTP + MQTT WebSocket at /mqtt + Terminal at /ws/terminal)`);
    } else {
      await this._mqttServer.start(this.config.mqttPort!);
      console.log(`MQTT Server started on port ${this.config.mqttPort}`);
      console.log(`HTTP Server started on port ${this.config.httpPort}`);
    }

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

  async shutdown(): Promise<void> {
    console.log('App shutting down...');

    this.schedulerService.shutdown();

    try {
      this.terminalService?.shutdown();
    } catch (err) {
      console.warn('Error stopping terminal service:', err);
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
