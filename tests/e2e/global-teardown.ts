import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(dirname, '../../data-test');

export default function globalTeardown() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}
