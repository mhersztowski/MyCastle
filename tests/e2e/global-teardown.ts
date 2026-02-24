import * as fs from 'fs';
import * as path from 'path';

const TEST_DATA_DIR = path.resolve(__dirname, '../../data-minis-test');

export default function globalTeardown() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}
