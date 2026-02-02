export enum PacketType {
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  FILE_LIST = 'file_list',
  FILE_WRITE_BINARY = 'file_write_binary',
  FILE_READ_BINARY = 'file_read_binary',
  RESPONSE = 'response',
  ERROR = 'error',
}

export interface PacketData {
  type: PacketType;
  id: string;
  timestamp: number;
  payload: unknown;
}

export interface FileData {
  path: string;
  content: string;
  lastModified: string;
}

export interface BinaryFileData {
  path: string;
  data: string; // Base64 encoded
  mimeType: string;
  size: number;
  lastModified: string;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryTree[];
}

export interface ResponsePayload {
  requestId: string;
  data: unknown;
}

export interface ErrorPayload {
  requestId: string;
  message: string;
  code?: string;
}
