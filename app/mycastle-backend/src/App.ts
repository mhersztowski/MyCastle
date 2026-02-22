import { MqttServer } from './modules/mqttserver/MqttServer';
import { FileSystem, FileChangeEvent } from './modules/filesystem';
import { HttpUploadServer } from './modules/httpserver/HttpUploadServer';
import { OcrService } from './modules/ocr/OcrService';
import { DataSource } from './modules/datasource';
import { AutomateService } from './modules/automate';
import { SchedulerService } from './modules/scheduler';

export interface AppConfig {
  httpPort: number;
  mqttPort: number | null;
  rootDir: string;
  staticDir: string | null;
}

export class App {
  private static _instance: App;

  readonly fileSystem: FileSystem;
  readonly ocrService: OcrService;
  readonly dataSource: DataSource;
  readonly automateService: AutomateService;
  readonly schedulerService: SchedulerService;
  readonly httpServer: HttpUploadServer;
  private _mqttServer!: MqttServer;
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

    this.fileSystem = new FileSystem(config.rootDir);
    this.ocrService = new OcrService();
    this.dataSource = new DataSource(this.fileSystem);
    this.automateService = new AutomateService(this.fileSystem, this.dataSource);
    this.schedulerService = new SchedulerService(this.automateService, this.fileSystem);

    this.httpServer = new HttpUploadServer(
      config.httpPort,
      this.fileSystem,
      this.ocrService,
      this.automateService,
      config.staticDir || undefined,
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

    await this.dataSource.initialize();
    console.log('DataSource initialized:', this.dataSource.getStats());

    await this.automateService.initialize();
    console.log(`AutomateService initialized: ${this.automateService.getAllFlows().length} flows`);

    await this.schedulerService.initialize();
    console.log(`SchedulerService initialized: ${this.schedulerService.getActiveJobs().length} active schedules`);

    // OCR initialization is non-blocking — if Tesseract fails, the rest of the server still works
    try {
      await this.ocrService.initialize();
      console.log('OCR Service initialized');
    } catch (ocrError) {
      console.warn('OCR Service failed to initialize (receipt OCR will be unavailable):', ocrError);
    }

    // Start HTTP and MQTT servers
    if (this.sharedPort) {
      await this.httpServer.start();
      this._mqttServer = new MqttServer(this.fileSystem, this.httpServer.getHttpServer());
      await this._mqttServer.start();
      console.log(`Server started on port ${this.config.httpPort} (HTTP + MQTT WebSocket at /mqtt)`);
    } else {
      this._mqttServer = new MqttServer(this.fileSystem);
      await this._mqttServer.start(this.config.mqttPort!);
      console.log(`MQTT Server started on port ${this.config.mqttPort}`);
      await this.httpServer.start();
      console.log(`HTTP Upload Server started on port ${this.config.httpPort}`);
    }

    if (this.config.staticDir) {
      console.log(`Serving frontend from: ${this.config.staticDir}`);
    }

    this.mqttServer.setAutomateService(this.automateService);

    this.fileSystem.on('fileChanged', async (event: FileChangeEvent) => {
      await this.dataSource.onFileChanged(event.path);
      this.mqttServer.broadcastFileChanged(event.path, event.action);

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

    // Graceful shutdown on signals
    const shutdownHandler = async () => {
      await this.shutdown();
      process.exit(0);
    };
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    console.log('App initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('App shutting down...');

    this.schedulerService.shutdown();

    try {
      await this.mqttServer.stop();
    } catch (err) {
      console.warn('Error stopping MQTT server:', err);
    }

    if (!this.sharedPort) {
      try {
        await this.httpServer.stop();
      } catch (err) {
        console.warn('Error stopping HTTP server:', err);
      }
    }

    try {
      await this.ocrService.shutdown();
    } catch (err) {
      console.warn('Error shutting down OCR service:', err);
    }

    console.log('App shut down gracefully');
  }
}
