import dotenv from 'dotenv';
import { MqttServer } from './modules/mqttserver/MqttServer';
import { FileSystem } from './modules/filesystem/FileSystem';
import { HttpUploadServer } from './modules/httpserver/HttpUploadServer';

dotenv.config();

const httpPort = parseInt(process.env.PORT || '3001', 10);
const mqttPort = parseInt(process.env.MQTT_PORT || '1884', 10);
const rootDir = process.env.ROOT_DIR || './data';

const fileSystem = new FileSystem(rootDir);
const mqttServer = new MqttServer(mqttPort, fileSystem);
const httpServer = new HttpUploadServer(httpPort, fileSystem);

async function main() {
  try {
    await fileSystem.initialize();
    console.log(`FileSystem initialized with root: ${rootDir}`);

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
