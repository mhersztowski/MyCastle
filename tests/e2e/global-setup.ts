import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Root package is ESM ("type":"module") so `__dirname` is undefined — derive it.
const dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = path.resolve(dirname, 'fixtures/data');
const TEST_DATA_DIR = path.resolve(dirname, '../../data-test');

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export default function globalSetup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
  copyDirSync(FIXTURES_DIR, TEST_DATA_DIR);
}
