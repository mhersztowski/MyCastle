import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { App } from './App';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const httpPort = parseInt(process.env.PORT || '1894', 10);
const mqttPort = process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT, 10) : null;
const rootDir = process.env.ROOT_DIR || '../../data';
const jwtSecret = process.env.JWT_SECRET || 'mycastle-dev-secret-change-in-production';
const staticDirEnv = process.env.STATIC_DIR || path.resolve(process.cwd(), '..', 'mycastle-web', 'build');
const staticDir = fs.existsSync(staticDirEnv) ? staticDirEnv : null;
const arduinoCliLocalPath = process.env.ARDUINO_CLI_LOCAL_PATH;
const arduinoCliDockerName = process.env.ARDUINO_CLI_DOCKER_NAME;
const arduinoCliDockerImage = process.env.ARDUINO_CLI_DOCKER_IMAGE;
const upythonCliLocalPath = process.env.UPYTHON_CLI_LOCAL_PATH;
const upythonDockerName = process.env.UPYTHON_DOCKER_NAME;
const upythonDockerImage = process.env.UPYTHON_DOCKER_IMAGE;
const pygbagPath = process.env.PYGBAG_PATH;
const pygameDockerName = process.env.PYGAME_DOCKER_NAME;
const pygameDockerImage = process.env.PYGAME_DOCKER_IMAGE;
const userDataPath = process.env.USER_DATA_PATH || 'Minis/Users/marcin';
const hostDataDir = process.env.HOST_DATA_DIR;

App.create({ httpPort, mqttPort, rootDir, staticDir, jwtSecret, arduinoCliLocalPath, arduinoCliDockerName, arduinoCliDockerImage, upythonCliLocalPath, upythonDockerName, upythonDockerImage, pygbagPath, pygameDockerName, pygameDockerImage, userDataPath, hostDataDir });

async function main() {
  try {
    await App.instance.init();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
