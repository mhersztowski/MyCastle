import mqtt, { MqttClient as MqttClientType } from 'mqtt';
import { v4 as uuidv4 } from 'uuid';
import { PacketType, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload } from './types';

const MQTT_SIZE_LIMIT = 2 * 1024 * 1024; // 2MB - use HTTP for larger files

const TOPICS = {
  REQUEST: 'mycastle/request',
  RESPONSE: 'mycastle/response',
};

// Normalize path to use forward slashes (Windows paths use backslashes)
const normalizePath = (path: string): string => path.replace(/\\/g, '/');

// Normalize paths in DirectoryTree to use forward slashes
const normalizeDirectoryTree = (tree: DirectoryTree): DirectoryTree => {
  return {
    ...tree,
    path: normalizePath(tree.path),
    children: tree.children?.map(normalizeDirectoryTree),
  };
};

// Normalize path in FileData
const normalizeFileData = (data: FileData): FileData => ({
  ...data,
  path: normalizePath(data.path),
});

// Normalize path in BinaryFileData
const normalizeBinaryFileData = (data: BinaryFileData): BinaryFileData => ({
  ...data,
  path: normalizePath(data.path),
});

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
};

export class MqttClient {
  private client: MqttClientType | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private connectionPromise: Promise<void> | null = null;

  async connect(brokerUrl: string = import.meta.env.VITE_MQTT_URL || 'ws://localhost:1893'): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.client = mqtt.connect(brokerUrl, {
        clientId: `mycastle_web_${Date.now()}`,
        protocol: 'ws',
      });

      this.client.on('connect', () => {
        this.client?.subscribe(TOPICS.RESPONSE, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.client.on('message', (topic, message) => {
        if (topic === TOPICS.RESPONSE) {
          this.handleResponse(message.toString());
        }
      });

      this.client.on('error', (err) => {
        reject(err);
      });
    });

    return this.connectionPromise;
  }

  disconnect(): void {
    this.client?.end();
    this.client = null;
    this.connectionPromise = null;
    this.pendingRequests.clear();
  }

  get isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  private handleResponse(message: string): void {
    try {
      const data: PacketData = JSON.parse(message);

      if (data.type === PacketType.RESPONSE) {
        const payload = data.payload as ResponsePayload;
        const pending = this.pendingRequests.get(payload.requestId);
        if (pending) {
          pending.resolve(payload.data);
          this.pendingRequests.delete(payload.requestId);
        }
      } else if (data.type === PacketType.ERROR) {
        const payload = data.payload as ErrorPayload;
        const pending = this.pendingRequests.get(payload.requestId);
        if (pending) {
          pending.reject(new Error(payload.message));
          this.pendingRequests.delete(payload.requestId);
        }
      }
    } catch (error) {
      console.error('Error parsing response:', error);
    }
  }

  private generateId(): string {
    return uuidv4();
  }

  private sendRequest<T>(type: PacketType, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected) {
        reject(new Error('Not connected to MQTT broker'));
        return;
      }

      const id = this.generateId();
      const packet: PacketData = {
        type,
        id,
        timestamp: Date.now(),
        payload,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });

      this.client.publish(TOPICS.REQUEST, JSON.stringify(packet), (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async readFile(path: string): Promise<FileData> {
    const data = await this.sendRequest<FileData>(PacketType.FILE_READ, { path });
    return normalizeFileData(data);
  }

  async writeFile(path: string, content: string): Promise<FileData> {
    const data = await this.sendRequest<FileData>(PacketType.FILE_WRITE, { path, content });
    return normalizeFileData(data);
  }

  async deleteFile(path: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>(PacketType.FILE_DELETE, { path });
  }

  async listDirectory(path: string = ''): Promise<DirectoryTree> {
    const tree = await this.sendRequest<DirectoryTree>(PacketType.FILE_LIST, { path });
    return normalizeDirectoryTree(tree);
  }

  async writeBinaryFile(path: string, data: string, mimeType: string): Promise<BinaryFileData> {
    const result = await this.sendRequest<BinaryFileData>(PacketType.FILE_WRITE_BINARY, { path, data, mimeType });
    return normalizeBinaryFileData(result);
  }

  async readBinaryFile(path: string): Promise<BinaryFileData> {
    const data = await this.sendRequest<BinaryFileData>(PacketType.FILE_READ_BINARY, { path });
    return normalizeBinaryFileData(data);
  }

  async syncDirinfo(path: string): Promise<unknown> {
    return this.sendRequest<unknown>(PacketType.DIRINFO_SYNC, { path });
  }

  async uploadFile(
    path: string,
    file: File | Blob,
    onProgress?: (progress: number) => void
  ): Promise<BinaryFileData> {
    const mimeType = file.type || 'application/octet-stream';

    // For small files, use MQTT
    if (file.size <= MQTT_SIZE_LIMIT) {
      const base64Data = await this.blobToBase64(file);
      return this.writeBinaryFile(path, base64Data, mimeType);
    }

    // For large files, use HTTP upload
    return this.httpUpload(path, file, mimeType, onProgress);
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async httpUpload(
    path: string,
    file: File | Blob,
    mimeType: string,
    onProgress?: (progress: number) => void
  ): Promise<BinaryFileData> {
    const httpUrl = import.meta.env.VITE_HTTP_UPLOAD_URL || 'http://localhost:3001/upload';

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || 'Upload failed'));
            }
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          reject(new Error(`HTTP error: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.open('POST', httpUrl);
      xhr.setRequestHeader('X-File-Path', path);
      xhr.setRequestHeader('X-Mime-Type', mimeType);
      xhr.send(file);
    });
  }
}

export const mqttClient = new MqttClient();
