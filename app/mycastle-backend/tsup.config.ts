import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: [
    '@mhersztowski/core',
    '@mhersztowski/core-backend',
    'dayjs',
    'dotenv',
    'node-cron',
    'sharp',
    'tesseract.js',
  ],
});
