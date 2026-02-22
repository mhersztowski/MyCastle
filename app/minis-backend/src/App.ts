import { MqttServer, FileSystem, HttpUploadServer } from '@mhersztowski/core-backend';
import type { FileChangeEvent } from '@mhersztowski/core-backend';

export interface AppConfig {
  httpPort: number;
  rootDir: string;
  staticDir?: string;
}

export class App {
  private static _instance: App;

  private fileSystem: FileSystem;
  private mqttServer!: MqttServer;
  private httpServer: HttpUploadServer;
  private config: AppConfig;

  private constructor(config: AppConfig) {
    this.config = config;
    this.fileSystem = new FileSystem(config.rootDir);
    this.httpServer = new HttpUploadServer(
      config.httpPort,
      this.fileSystem,
      undefined, // no OCR
      undefined, // no automate
      undefined, // no receipt parser
      config.staticDir,
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

    // Start HTTP server, then attach MQTT on same port
    await this.httpServer.start();
    this.mqttServer = new MqttServer(this.fileSystem, this.httpServer.getHttpServer());
    await this.mqttServer.start();
    console.log(`Server started on port ${this.config.httpPort} (HTTP + MQTT WebSocket at /mqtt)`);

    if (this.config.staticDir) {
      console.log(`Serving frontend from: ${this.config.staticDir}`);
    }

    // Forward file changes to MQTT clients
    this.fileSystem.on('fileChanged', (event: FileChangeEvent) => {
      this.mqttServer.broadcastFileChanged(event.path, event.action);
    });

    // Graceful shutdown
    const shutdownHandler = async () => {
      await this.shutdown();
      process.exit(0);
    };
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    console.log('Minis backend initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('App shutting down...');

    try {
      await this.mqttServer.stop();
    } catch (err) {
      console.warn('Error stopping MQTT server:', err);
    }

    console.log('App shut down gracefully');
  }
}
