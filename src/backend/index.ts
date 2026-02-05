import dotenv from 'dotenv';
import { MqttServer } from './modules/mqttserver/MqttServer';
import { FileSystem } from './modules/filesystem/FileSystem';
import { HttpUploadServer } from './modules/httpserver/HttpUploadServer';
import { OcrService } from './modules/ocr/OcrService';

dotenv.config();

const httpPort = parseInt(process.env.PORT || '3001', 10);
const mqttPort = parseInt(process.env.MQTT_PORT || '1884', 10);
const rootDir = process.env.ROOT_DIR || './data';

const fileSystem = new FileSystem(rootDir);
const mqttServer = new MqttServer(mqttPort, fileSystem);
const ocrService = new OcrService();

async function main() {
  try {
    await fileSystem.initialize();
    console.log(`FileSystem initialized with root: ${rootDir}`);

    // OCR initialization is non-blocking — if Tesseract fails, the rest of the server still works
    try {
      await ocrService.initialize();
      console.log('OCR Service initialized');
    } catch (ocrError) {
      console.warn('OCR Service failed to initialize (receipt OCR will be unavailable):', ocrError);
    }

    const httpServer = new HttpUploadServer(httpPort, fileSystem, ocrService);

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
