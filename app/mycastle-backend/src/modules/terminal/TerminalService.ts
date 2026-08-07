import fs from 'node:fs';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Duplex } from 'stream';
import * as url from 'url';
import * as crypto from 'crypto';
import * as pty from 'node-pty';
import type { JwtService, ApiKeyService } from '@mhersztowski/core-backend';
import type { AuthTokenPayload } from '@mhersztowski/core';

interface TerminalSession {
  ws: WebSocket;
  pty: pty.IPty;
}

interface PendingTicket {
  payload: AuthTokenPayload;
  createdAt: number;
}

const TICKET_TTL_MS = 30_000;

export class TerminalService {
  private wss: WebSocketServer;
  private sessions = new Map<WebSocket, TerminalSession>();
  private tickets = new Map<string, PendingTicket>();

  constructor(_jwtService: JwtService, _apiKeyService: ApiKeyService) {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupConnectionHandler();
  }

  /** Create a one-time ticket for a verified admin user. Called from HTTP endpoint. */
  createTicket(payload: AuthTokenPayload): string {
    this.cleanExpiredTickets();
    const ticket = crypto.randomBytes(32).toString('hex');
    this.tickets.set(ticket, { payload, createdAt: Date.now() });
    return ticket;
  }

  attach(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const parsed = url.parse(request.url || '', false);
      if (parsed.pathname !== '/ws/terminal') return;

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws);
      });
    });
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      session.pty.kill();
      session.ws.close();
    }
    this.sessions.clear();
    this.tickets.clear();
    this.wss.close();
  }

  private cleanExpiredTickets(): void {
    const now = Date.now();
    for (const [id, ticket] of this.tickets) {
      if (now - ticket.createdAt > TICKET_TTL_MS) {
        this.tickets.delete(id);
      }
    }
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const authTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'error', data: 'Auth timeout' }));
        ws.close();
      }, 5000);

      ws.once('message', (raw: Buffer | string) => {
        clearTimeout(authTimeout);

        // Rozbiór wiadomości osobno od uruchomienia sesji.
        //
        // Wcześniej jeden `try` obejmował oba kroki, więc awaria `pty.spawn`
        // wracała do klienta jako „Invalid auth message" — komunikat wskazujący
        // na zły format wiadomości, gdy w rzeczywistości format był poprawny,
        // a nie dało się otworzyć powłoki. Diagnostyka szła wtedy w złą stronę.
        let msg: { type?: string; ticket?: string };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          ws.send(JSON.stringify({ type: 'error', data: 'Invalid auth message' }));
          ws.close();
          return;
        }

        try {
          if (msg.type !== 'auth' || !msg.ticket) {
            ws.send(JSON.stringify({ type: 'error', data: 'Expected auth message with ticket' }));
            ws.close();
            return;
          }

          const pending = this.tickets.get(msg.ticket);
          if (!pending || Date.now() - pending.createdAt > TICKET_TTL_MS) {
            this.tickets.delete(msg.ticket);
            ws.send(JSON.stringify({ type: 'error', data: 'Invalid or expired ticket' }));
            ws.close();
            return;
          }

          // Consume ticket (one-time use)
          this.tickets.delete(msg.ticket);
          this.startTerminalSession(ws);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'error', data: `Terminal session failed: ${reason}` }));
          ws.close();
        }
      });

      ws.on('error', () => {
        clearTimeout(authTimeout);
      });
    });
  }

  /**
   * Powłoka, którą da się uruchomić w tym środowisku.
   *
   * `process.env.SHELL` bierze się ze środowiska, w którym backend wystartował,
   * i wcale nie musi istnieć tam, gdzie backend działa — pod systemd, w
   * kontenerze albo pod innym użytkownikiem bywa pusty albo wskazuje powłokę,
   * której w obrazie nie ma. `pty.spawn` kończy się wtedy `posix_spawnp failed`,
   * bez podpowiedzi, czego brakuje. Sprawdzamy więc kandydatów po kolei.
   */
  private resolveShell(): string {
    const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
      `nie znaleziono powłoki (sprawdzono: ${candidates.filter(Boolean).join(', ')})`,
    );
  }

  /** Katalog startowy — musi istnieć, inaczej spawn pada tak samo jak bez powłoki. */
  private resolveCwd(): string {
    const home = process.env.HOME;
    return home && fs.existsSync(home) ? home : '/';
  }

  private startTerminalSession(ws: WebSocket): void {
    const shell = this.resolveShell();
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.resolveCwd(),
      env: process.env as Record<string, string>,
    });

    const session: TerminalSession = { ws, pty: term };
    this.sessions.set(ws, session);

    ws.send(JSON.stringify({ type: 'ready' }));

    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    term.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
        ws.close();
      }
      this.sessions.delete(ws);
    });

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'input' && typeof msg.data === 'string') {
          term.write(msg.data);
        } else if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          term.resize(Math.max(1, msg.cols), Math.max(1, msg.rows));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      term.kill();
      this.sessions.delete(ws);
    });

    ws.on('error', () => {
      term.kill();
      this.sessions.delete(ws);
    });

    console.log('Terminal session started');
  }
}
