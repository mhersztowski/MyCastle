import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { MqttServer } from './modules/mqttserver/MqttServer';
import { FileSystem, FileChangeEvent } from './modules/filesystem';
import { HttpUploadServer } from './modules/httpserver/HttpUploadServer';
import { OcrService } from './modules/ocr/OcrService';
import { DataSource } from './modules/datasource';
import { AutomateService } from './modules/automate';
import { SchedulerService } from './modules/scheduler';

dotenv.config();

const httpPort = parseInt(process.env.PORT || '3001', 10);
const mqttPort = process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT, 10) : null;
const rootDir = process.env.ROOT_DIR || './data';
const staticDirEnv = process.env.STATIC_DIR || path.resolve(process.cwd(), 'src', 'client', 'build');
const staticDir = fs.existsSync(staticDirEnv) ? staticDirEnv : null;

// Shared mode: MQTT on same port as HTTP (for deployment)
// Dual-port mode: MQTT on separate port (for local development)
const sharedPort = !mqttPort || mqttPort === httpPort;

const fileSystem = new FileSystem(rootDir);
const ocrService = new OcrService();
const dataSource = new DataSource(fileSystem);
const automateService = new AutomateService(fileSystem, dataSource);
const schedulerService = new SchedulerService(automateService, fileSystem);

async function main() {
  try {
    await fileSystem.initialize();
    console.log(`FileSystem initialized with root: ${rootDir}`);

    await dataSource.initialize();
    console.log('DataSource initialized:', dataSource.getStats());

    await automateService.initialize();
    console.log(`AutomateService initialized: ${automateService.getAllFlows().length} flows`);

    await schedulerService.initialize();
    console.log(`SchedulerService initialized: ${schedulerService.getActiveJobs().length} active schedules`);

    // OCR initialization is non-blocking — if Tesseract fails, the rest of the server still works
    try {
      await ocrService.initialize();
      console.log('OCR Service initialized');
    } catch (ocrError) {
      console.warn('OCR Service failed to initialize (receipt OCR will be unavailable):', ocrError);
    }

    const httpServer = new HttpUploadServer(httpPort, fileSystem, ocrService, automateService, staticDir || undefined);
    let mqttServer: MqttServer;

    if (sharedPort) {
      // Shared mode: start HTTP first, then attach MQTT to the same server
      await httpServer.start();
      mqttServer = new MqttServer(fileSystem, httpServer.getHttpServer());
      await mqttServer.start();
      console.log(`Server started on port ${httpPort} (HTTP + MQTT WebSocket at /mqtt)`);
    } else {
      // Dual-port mode: separate HTTP and MQTT servers
      mqttServer = new MqttServer(fileSystem);
      await mqttServer.start(mqttPort!);
      console.log(`MQTT Server started on port ${mqttPort}`);

      await httpServer.start();
      console.log(`HTTP Upload Server started on port ${httpPort}`);
    }

    if (staticDir) {
      console.log(`Serving frontend from: ${staticDir}`);
    }

    mqttServer.setAutomateService(automateService);

    fileSystem.on('fileChanged', async (event: FileChangeEvent) => {
      await dataSource.onFileChanged(event.path);
      mqttServer.broadcastFileChanged(event.path, event.action);

      // Reload automations when the file changes
      if (event.path.replace(/\\/g, '/') === 'data/automations.json') {
        await automateService.reload();
        console.log(`AutomateService reloaded: ${automateService.getAllFlows().length} flows`);
        await schedulerService.reload();
        console.log(`SchedulerService reloaded: ${schedulerService.getActiveJobs().length} active schedules`);
      }

      // Reload scheduler when any .automate.json file changes
      if (event.path.endsWith('.automate.json')) {
        await schedulerService.reload();
        console.log(`SchedulerService reloaded (file: ${event.path}): ${schedulerService.getActiveJobs().length} active schedules`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
