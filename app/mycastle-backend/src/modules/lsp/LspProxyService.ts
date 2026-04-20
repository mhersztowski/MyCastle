import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Duplex } from 'stream';
import * as url from 'url';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { JwtService } from '@mhersztowski/core-backend';

const MARKSMAN_BIN = process.env.MARKSMAN_BIN ?? 'marksman';

interface LspSession {
  ws: WebSocket;
  proc: ChildProcess;
  workspaceRoot: string;
}

/** Parses LSP Content-Length framed stdout into discrete JSON message strings. */
class LspFrameParser {
  private buf = '';

  push(chunk: Buffer | string): string[] {
    this.buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const messages: string[] = [];

    while (true) {
      const headerEnd = this.buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buf.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buf = this.buf.slice(headerEnd + 4);
        continue;
      }

      const length = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buf.length < bodyStart + length) break;

      messages.push(this.buf.slice(bodyStart, bodyStart + length));
      this.buf = this.buf.slice(bodyStart + length);
    }

    return messages;
  }
}

export class LspProxyService {
  private wss: WebSocketServer;
  private sessions = new Map<WebSocket, LspSession>();

  constructor(private readonly jwtService: JwtService, private readonly rootDir: string) {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupConnectionHandler();
  }

  attach(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const parsed = url.parse(request.url ?? '', true);
      if (parsed.pathname !== '/ws/lsp/markdown') return;

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as WebSocket & { _parsedUrl: ReturnType<typeof url.parse> })._parsedUrl = parsed;
        this.wss.emit('connection', ws, request);
      });
    });
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      session.proc.kill();
      session.ws.close();
    }
    this.sessions.clear();
    this.wss.close();
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const parsed = (ws as WebSocket & { _parsedUrl?: ReturnType<typeof url.parse> })._parsedUrl;
      const queryParams = (parsed?.query ?? {}) as Record<string, string | string[] | undefined>;
      const tokenRaw = queryParams['token'];
      const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

      if (!token || typeof token !== 'string') {
        ws.close(1008, 'Missing token');
        return;
      }

      const payload = this.jwtService.verify(token);
      if (!payload) {
        ws.close(1008, 'Invalid token');
        return;
      }

      const workspaceRoot = path.join(this.rootDir, 'Minis', 'Users', payload.userName);
      this.startSession(ws, workspaceRoot);
    });
  }

  private startSession(ws: WebSocket, workspaceRoot: string): void {
    let proc: ChildProcess;
    try {
      proc = spawn(MARKSMAN_BIN, ['server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: workspaceRoot,
        env: { ...process.env },
      });
    } catch (err) {
      console.error('[LspProxy] Failed to spawn marksman:', err);
      ws.close(1011, 'Failed to start LSP server');
      return;
    }

    const session: LspSession = { ws, proc, workspaceRoot };
    this.sessions.set(ws, session);

    // URI bases for rewriting: VFS uses file:///home/, real FS uses file://{workspaceRoot}/
    const vfsBase = 'file:///home/';
    const fsBase = `file://${workspaceRoot}/`;

    // marksman stdout → WebSocket (strip LSP framing, rewrite URIs)
    const parser = new LspFrameParser();
    proc.stdout!.on('data', (chunk: Buffer) => {
      for (const msg of parser.push(chunk)) {
        const rewritten = msg.replaceAll(fsBase, vfsBase);
        if (ws.readyState === WebSocket.OPEN) ws.send(rewritten);
      }
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      process.stdout.write(`[marksman] ${chunk.toString('utf8').trim()}\n`);
    });

    proc.on('exit', (code) => {
      console.log(`[LspProxy] marksman exited (code ${code}) for ${workspaceRoot}`);
      if (ws.readyState === WebSocket.OPEN) ws.close();
      this.sessions.delete(ws);
    });

    // WebSocket → marksman stdin (rewrite URIs, add LSP Content-Length framing)
    ws.on('message', (raw: Buffer | string) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      const rewritten = text.replaceAll(vfsBase, fsBase);
      const body = Buffer.from(rewritten, 'utf8');
      const header = `Content-Length: ${body.length}\r\n\r\n`;
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write(Buffer.concat([Buffer.from(header, 'utf8'), body]));
      }
    });

    ws.on('close', () => {
      proc.kill();
      this.sessions.delete(ws);
    });

    ws.on('error', () => {
      proc.kill();
      this.sessions.delete(ws);
    });

    console.log(`[LspProxy] marksman session started for ${workspaceRoot}`);
  }
}
