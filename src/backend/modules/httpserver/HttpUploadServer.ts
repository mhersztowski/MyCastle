import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { FileSystem, BinaryFileData } from '../filesystem/FileSystem';
import { OcrService } from '../ocr/OcrService';
import { PolishReceiptParser, ParsedReceipt } from '../ocr/PolishReceiptParser';
import * as path from 'path';
import * as url from 'url';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_OCR_BODY_SIZE = 30 * 1024 * 1024; // 30MB for multiple images

interface UploadResult {
  success: boolean;
  data?: BinaryFileData;
  error?: string;
}

interface OcrResponse {
  success: boolean;
  text?: string;
  parsed?: ParsedReceipt;
  confidence?: number;
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
  private ocrService?: OcrService;
  private receiptParser: PolishReceiptParser;

  constructor(port: number, fileSystem: FileSystem, ocrService?: OcrService) {
    this.port = port;
    this.fileSystem = fileSystem;
    this.ocrService = ocrService;
    this.receiptParser = new PolishReceiptParser();
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

    if (req.method === 'POST' && req.url === '/ocr') {
      await this.handleOcr(req, res);
      return;
    }

    if (req.method === 'GET' && req.url === '/ocr/status') {
      this.handleOcrStatus(res);
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

  private handleOcrStatus(res: ServerResponse): void {
    const available = this.ocrService?.isAvailable() ?? false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      available,
      languages: available ? ['pol'] : [],
    }));
  }

  private async handleOcr(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.ocrService?.isAvailable()) {
      this.sendOcrResponse(res, 503, { success: false, error: 'OCR service not available' });
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_OCR_BODY_SIZE) {
        this.sendOcrResponse(res, 413, { success: false, error: 'Request body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        const { images } = JSON.parse(body) as { images: string[] };

        if (!images || !Array.isArray(images) || images.length === 0) {
          this.sendOcrResponse(res, 400, { success: false, error: 'Missing or empty images array' });
          return;
        }

        const ocrResult = await this.ocrService!.processMultipleImages(images);
        const parsed = this.receiptParser.parse(ocrResult.text);

        this.sendOcrResponse(res, 200, {
          success: true,
          text: ocrResult.text,
          parsed,
          confidence: ocrResult.confidence,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'OCR processing failed';
        console.error('OCR error:', error);
        this.sendOcrResponse(res, 500, { success: false, error: errorMessage });
      }
    });

    req.on('error', (error) => {
      console.error('OCR request error:', error);
      this.sendOcrResponse(res, 500, { success: false, error: 'OCR request failed' });
    });
  }

  private sendOcrResponse(res: ServerResponse, statusCode: number, data: OcrResponse): void {
    if (!res.writableEnded) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
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
