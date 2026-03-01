import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { App } from './App';

dotenv.config();

const httpPort = parseInt(process.env.PORT || '1902', 10);
const rootDir = process.env.ROOT_DIR || '../../data';
const jwtSecret = process.env.JWT_SECRET || 'minis-dev-secret-change-in-production';
const staticDirEnv = process.env.STATIC_DIR || path.resolve(process.cwd(), '..', 'minis-web', 'build');
const staticDir = fs.existsSync(staticDirEnv) ? staticDirEnv : undefined;
const arduinoCliLocalPath = process.env.ARDUINO_CLI_LOCAL_PATH;
const arduinoCliDockerName = process.env.ARDUINO_CLI_DOCKER_NAME;

App.create({ httpPort, rootDir, jwtSecret, staticDir, arduinoCliLocalPath, arduinoCliDockerName });

async function main() {
  try {
    await App.instance.init();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
