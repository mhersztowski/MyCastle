import dotenv from 'dotenv';
import { MqttServer } from './modules/mqttserver/MqttServer';
import { FileSystem, FileChangeEvent } from './modules/filesystem';
import { HttpUploadServer } from './modules/httpserver/HttpUploadServer';
import { OcrService } from './modules/ocr/OcrService';
import { DataSource } from './modules/datasource';
import { AutomateService } from './modules/automate';
import { SchedulerService } from './modules/scheduler';

dotenv.config();

const httpPort = parseInt(process.env.PORT || '3001', 10);
const mqttPort = parseInt(process.env.MQTT_PORT || '1884', 10);
const rootDir = process.env.ROOT_DIR || './data';

const fileSystem = new FileSystem(rootDir);
const mqttServer = new MqttServer(mqttPort, fileSystem);
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

    // OCR initialization is non-blocking — if Tesseract fails, the rest of the server still works
    try {
      await ocrService.initialize();
      console.log('OCR Service initialized');
    } catch (ocrError) {
      console.warn('OCR Service failed to initialize (receipt OCR will be unavailable):', ocrError);
    }

    const httpServer = new HttpUploadServer(httpPort, fileSystem, ocrService, automateService);

    await mqttServer.start();
    console.log(`MQTT Server started on port ${mqttPort}`);

    await httpServer.start();
    console.log(`HTTP Upload Server started on port ${httpPort}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
