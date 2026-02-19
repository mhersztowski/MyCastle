import type AedesServer from 'aedes/types/instance';
import type { Client as AedesClient, PublishPacket } from 'aedes';
import aedes from 'aedes';
const { createBroker } = aedes as unknown as { createBroker: () => AedesServer };
import { createServer as createHttpServer, Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket, createWebSocketStream } from 'ws';
import { Duplex } from 'stream';
import * as url from 'url';
import { FileSystem } from '../filesystem/FileSystem';
import { AutomateService } from '../automate/AutomateService';
import { Client } from './Client';
import {
  Packet,
  PacketData,
  PacketType,
  FileReadPacket,
  FileWritePacket,
  FileDeletePacket,
  FileListPacket,
  FileWriteBinaryPacket,
  FileReadBinaryPacket,
  FileChangedPacket,
  AutomateRunPacket,
  ResponsePacket,
  ErrorPacket,
} from './packets';

const TOPICS = {
  REQUEST: 'mycastle/request',
  RESPONSE: 'mycastle/response',
};

export class MqttServer {
  private aedes: AedesServer;
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private externalHttpServer: boolean;
  private fileSystem: FileSystem;
  private automateService: AutomateService | null = null;
  private clients: Map<string, Client>;

  constructor(fileSystem: FileSystem, httpServer?: HttpServer) {
    this.fileSystem = fileSystem;
    this.clients = new Map();
    this.aedes = createBroker();

    if (httpServer) {
      // Shared mode: attach to existing HTTP server with path-based routing
      this.httpServer = httpServer;
      this.externalHttpServer = true;
      this.wss = new WebSocketServer({ noServer: true });
      this.setupUpgradeHandler(httpServer);
    } else {
      // Standalone mode: create own HTTP server
      this.httpServer = createHttpServer();
      this.externalHttpServer = false;
      this.wss = new WebSocketServer({ server: this.httpServer });
    }

    this.setupWebSocket();
    this.setupEventHandlers();
  }

  private setupUpgradeHandler(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = url.parse(request.url || '', false).pathname;

      if (pathname === '/mqtt') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const stream = createWebSocketStream(ws);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.aedes.handle(stream as any);
    });
  }

  private setupEventHandlers(): void {
    this.aedes.on('client', (client: AedesClient) => {
      console.log(`Client connected: ${client.id}`);
      this.clients.set(client.id, new Client(client));
    });

    this.aedes.on('clientDisconnect', (client: AedesClient) => {
      console.log(`Client disconnected: ${client.id}`);
      this.clients.delete(client.id);
    });

    this.aedes.on('publish', async (packet: PublishPacket, client: AedesClient | null) => {
      if (!client || packet.topic !== TOPICS.REQUEST) {
        return;
      }

      try {
        const message = packet.payload.toString();
        const packetData = Packet.deserialize(message);
        await this.handlePacket(packetData, client.id);
      } catch (error) {
        console.error('Error processing packet:', error);
      }
    });
  }

  private async handlePacket(data: PacketData, clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      let responseData: unknown;

      switch (data.type) {
        case PacketType.FILE_READ: {
          const packet = FileReadPacket.fromPayload(data.payload as { path: string }, data.id);
          const fileData = await this.fileSystem.readFile(packet.path);
          responseData = fileData;
          break;
        }

        case PacketType.FILE_WRITE: {
          const packet = FileWritePacket.fromPayload(
            data.payload as { path: string; content: string },
            data.id
          );
          const fileData = await this.fileSystem.writeFile(packet.path, packet.content);
          responseData = fileData;
          break;
        }

        case PacketType.FILE_DELETE: {
          const packet = FileDeletePacket.fromPayload(data.payload as { path: string }, data.id);
          await this.fileSystem.deleteFile(packet.path);
          responseData = { success: true };
          break;
        }

        case PacketType.FILE_LIST: {
          const packet = FileListPacket.fromPayload(data.payload as { path?: string }, data.id);
          const tree = await this.fileSystem.listDirectory(packet.path);
          responseData = tree;
          break;
        }

        case PacketType.FILE_WRITE_BINARY: {
          const packet = FileWriteBinaryPacket.fromPayload(
            data.payload as { path: string; data: string; mimeType: string },
            data.id
          );
          const binaryData = await this.fileSystem.writeBinaryFile(
            packet.path,
            packet.data,
            packet.mimeType
          );
          responseData = binaryData;
          break;
        }

        case PacketType.FILE_READ_BINARY: {
          const packet = FileReadBinaryPacket.fromPayload(
            data.payload as { path: string },
            data.id
          );
          const binaryData = await this.fileSystem.readBinaryFile(packet.path);
          responseData = binaryData;
          break;
        }

        case PacketType.DIRINFO_SYNC: {
          const payload = data.payload as { path: string };
          const dirinfo = await this.fileSystem.syncDirinfo(payload.path);
          responseData = dirinfo;
          break;
        }

        case PacketType.AUTOMATE_RUN: {
          if (!this.automateService) {
            throw new Error('AutomateService not available');
          }
          const automatePacket = AutomateRunPacket.fromPayload(
            data.payload as { flowId: string; variables?: Record<string, unknown> },
            data.id
          );
          responseData = await this.automateService.executeFlow(
            automatePacket.flowId,
            automatePacket.variables
          );
          break;
        }

        default:
          throw new Error(`Unknown packet type: ${data.type}`);
      }

      const response = new ResponsePacket(data.id, responseData);
      this.publish(TOPICS.RESPONSE, response.serialize());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorPacket = new ErrorPacket(data.id, errorMessage);
      this.publish(TOPICS.RESPONSE, errorPacket.serialize());
    }
  }

  private publish(topic: string, message: string): void {
    this.aedes.publish(
      {
        cmd: 'publish',
        qos: 1,
        topic,
        payload: Buffer.from(message),
        dup: false,
        retain: false,
      },
      (err?: Error) => {
        if (err) {
          console.error('Error publishing message:', err);
        }
      }
    );
  }

  async start(port?: number): Promise<void> {
    if (this.externalHttpServer) {
      // Shared mode: HTTP server is managed externally
      return;
    }

    return new Promise((resolve, reject) => {
      this.httpServer.listen(port, () => {
        resolve();
      });

      this.httpServer.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.aedes.close(() => {
        if (this.externalHttpServer) {
          resolve();
        } else {
          this.httpServer.close(() => {
            resolve();
          });
        }
      });
    });
  }

  setAutomateService(service: AutomateService): void {
    this.automateService = service;
  }

  broadcastFileChanged(path: string, action: 'write' | 'delete'): void {
    const packet = new FileChangedPacket(path, action);
    this.publish(TOPICS.RESPONSE, packet.serialize());
  }

  getConnectedClients(): Client[] {
    return Array.from(this.clients.values());
  }
}
