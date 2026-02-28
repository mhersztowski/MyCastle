import { MqttServer, FileSystem, JwtService, PasswordService, ApiKeyService } from '@mhersztowski/core-backend';
import type { FileChangeEvent } from '@mhersztowski/core-backend';
import { MinisHttpServer } from './MinisHttpServer.js';
import { IotService } from './iot/IotService.js';
import { TerminalService } from './terminal/TerminalService.js';

export interface AppConfig {
  httpPort: number;
  rootDir: string;
  jwtSecret: string;
  staticDir?: string;
}

export class App {
  private static _instance: App;

  private fileSystem: FileSystem;
  private mqttServer!: MqttServer;
  private httpServer: MinisHttpServer;
  private iotService: IotService;
  private terminalService!: TerminalService;
  private jwtService: JwtService;
  private apiKeyService: ApiKeyService;
  private config: AppConfig;

  private constructor(config: AppConfig) {
    this.config = config;
    this.fileSystem = new FileSystem(config.rootDir);
    this.iotService = new IotService(config.rootDir);
    this.jwtService = new JwtService(config.jwtSecret);
    this.apiKeyService = new ApiKeyService(this.fileSystem, 'Minis/Admin/ApiKeys.json');
    this.httpServer = new MinisHttpServer(
      config.httpPort,
      this.fileSystem,
      this.jwtService,
      this.apiKeyService,
      this.iotService,
      config.staticDir,
      config.rootDir,
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

    // Start HTTP server, then attach MQTT on same port
    await this.httpServer.start();
    this.mqttServer = new MqttServer(this.fileSystem, this.httpServer.getHttpServer());

    // MQTT authentication: accept API key, JWT token, or username+password
    this.mqttServer.setAuthenticate(async (_clientId, username, password) => {
      // Try API key first (fast prefix check)
      if (ApiKeyService.isApiKey(password)) {
        return this.apiKeyService.verify(password) !== null;
      }
      // Try JWT token (browser/emulator sends token as password)
      const payload = this.jwtService.verify(password);
      if (payload) return true;
      // Fallback: verify username+password against user store
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

    // Attach terminal WebSocket service on same HTTP server
    this.terminalService = new TerminalService(this.jwtService, this.apiKeyService);
    this.terminalService.attach(this.httpServer.getHttpServer());
    this.httpServer.setTerminalService(this.terminalService);

    await this.mqttServer.start();
    console.log(`Server started on port ${this.config.httpPort} (HTTP + MQTT WebSocket at /mqtt + Terminal at /ws/terminal)`);

    if (this.config.staticDir) {
      console.log(`Serving frontend from: ${this.config.staticDir}`);
    }

    // Forward file changes to MQTT clients
    this.fileSystem.on('fileChanged', (event: FileChangeEvent) => {
      this.mqttServer.broadcastFileChanged(event.path, event.action);
    });

    // Start IoT service — wire MQTT publish and subscribe to IoT topics
    this.iotService.start((topic, payload) => {
      this.mqttServer.publishMessage(topic, payload);
    });
    this.mqttServer.onMessage((topic, payload) => {
      if (topic.startsWith('minis/')) {
        this.iotService.handleMqttMessage(topic, payload);
      }
    });
    console.log('IoT service started (SQLite + MQTT)');

    // Graceful shutdown
    const shutdownHandler = async () => {
      await this.shutdown();
      process.exit(0);
    };
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    console.log('Minis backend initialized successfully');
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

    try {
      this.terminalService.shutdown();
    } catch (err) {
      console.warn('Error stopping terminal service:', err);
    }

    try {
      this.iotService.stop();
    } catch (err) {
      console.warn('Error stopping IoT service:', err);
    }

    try {
      await this.mqttServer.stop();
    } catch (err) {
      console.warn('Error stopping MQTT server:', err);
    }

    try {
      await this.httpServer.stop();
    } catch (err) {
      console.warn('Error stopping HTTP server:', err);
    }

    console.log('App shut down gracefully');
  }
}
