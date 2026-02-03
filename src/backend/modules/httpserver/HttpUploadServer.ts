import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { FileSystem, BinaryFileData } from '../filesystem/FileSystem';
import * as path from 'path';
import * as url from 'url';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadResult {
  success: boolean;
  data?: BinaryFileData;
  error?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

export class HttpUploadServer {
  private server: Server;
  private port: number;
  private fileSystem: FileSystem;

  constructor(port: number, fileSystem: FileSystem) {
    this.port = port;
    this.fileSystem = fileSystem;
    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Path, X-Mime-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
      await this.handleUpload(req, res);
      return;
    }

    // Handle file serving: GET /files/path/to/file.jpg
    if (req.method === 'GET' && req.url?.startsWith('/files/')) {
      await this.handleFileServe(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async handleFileServe(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Extract file path from URL (remove /files/ prefix)
      const parsedUrl = url.parse(req.url || '', true);
      const filePath = decodeURIComponent((parsedUrl.pathname || '').replace(/^\/files\//, ''));

      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing file path' }));
        return;
      }

      // Security: Only allow files from data/public directory
      const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
      if (!normalizedPath.startsWith('data/public/') && normalizedPath !== 'data/public') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied: only files from data/public are allowed' }));
        return;
      }

      // Read the file
      const fileData = await this.fileSystem.readBinaryFile(filePath);

      // Get the correct mime type
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || fileData.mimeType || 'application/octet-stream';

      // Decode base64 to buffer
      const buffer = Buffer.from(fileData.data, 'base64');

      // Set caching headers
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);

      res.writeHead(200);
      res.end(buffer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'File not found';
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  private async handleUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const filePath = req.headers['x-file-path'] as string;
    const mimeType = req.headers['x-mime-type'] as string || 'application/octet-stream';

    if (!filePath) {
      this.sendResponse(res, 400, { success: false, error: 'Missing X-File-Path header' });
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        this.sendResponse(res, 413, {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
        });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const base64Data = buffer.toString('base64');

        const result = await this.fileSystem.writeBinaryFile(filePath, base64Data, mimeType);

        this.sendResponse(res, 200, { success: true, data: result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        this.sendResponse(res, 500, { success: false, error: errorMessage });
      }
    });

    req.on('error', (error) => {
      console.error('Upload error:', error);
      this.sendResponse(res, 500, { success: false, error: 'Upload failed' });
    });
  }

  private sendResponse(res: ServerResponse, statusCode: number, data: UploadResult): void {
    if (!res.writableEnded) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}
