// filesystem
export { FileSystem } from './filesystem/FileSystem';
export type { FileData, BinaryFileData, DirectoryTree, FileChangeEvent, DirinfoData, DirinfoFile, DirinfoFileComponent } from './filesystem/FileSystem';

// datasource
export { DataSource } from './datasource/DataSource';

// httpserver
export { HttpUploadServer } from './httpserver/HttpUploadServer';

// mqttserver
export { MqttServer } from './mqttserver/MqttServer';
export type { MqttMessageHandler, MqttAuthenticateFn } from './mqttserver/MqttServer';
export { Client } from './mqttserver/Client';
export { Packet } from './mqttserver/packets/Packet';
export type { PacketData } from './mqttserver/packets/Packet';
export { FileReadPacket } from './mqttserver/packets/FileReadPacket';
export { FileWritePacket } from './mqttserver/packets/FileWritePacket';
export { FileDeletePacket } from './mqttserver/packets/FileDeletePacket';
export { FileListPacket } from './mqttserver/packets/FileListPacket';
export { FileWriteBinaryPacket } from './mqttserver/packets/FileWriteBinaryPacket';
export { FileReadBinaryPacket } from './mqttserver/packets/FileReadBinaryPacket';
export { FileChangedPacket } from './mqttserver/packets/FileChangedPacket';
export { AutomateRunPacket } from './mqttserver/packets/AutomateRunPacket';
export { ResponsePacket } from './mqttserver/packets/ResponsePacket';
export { ErrorPacket } from './mqttserver/packets/ErrorPacket';

// auth
export { PasswordService, JwtService, ApiKeyService, extractBearerToken, checkAuth } from './auth/index';

// rpc
export { RpcRouter } from './rpc/index';
export type { RpcHandler, RpcContext } from './rpc/index';

// scripts
export { ScriptsService } from './scripts/ScriptsService';
export type { ScriptInfo, RunResult } from './scripts/ScriptsService';

// api — fasada klienta dla skryptów backendowych (Drive scripts)
export {
  ConnType,
  Conn,
  Auth,
  Person,
  AgentAiModel,
  AiChat,
  conn_http_connect,
  conn_http_disconnect,
  conn_mqtt_connect,
  conn_mqtt_disconnect,
  conn_mqtt_topic_cmd,
  conn_mqtt_topic_cmd_res,
  conn_on_error,
  conn_on_res,
  conn_path_user,
  file_read_string,
  file_write_string,
  git_clone,
  git_add_all,
  git_commit,
  git_push,
  git_pull,
  git_diff,
  git_history,
  git_commit_current,
} from './api';
export type { ConnResponse, ResCallback, ErrCallback } from './api';

// server — realizacja API backendu (HTTP + MQTT)
export { ServerApi, ServerLogic, GitTool, SERVER_CMD_TOPIC, clientResTopic } from './server/api';
export type {
  MqttBus,
  ServerCommand,
  ServerResponse,
  ServerCmdBody,
  GitResult,
  GitDiffResult,
  GitCommit,
} from './server/api';

// interfaces
export type {
  IAutomateService,
  IOcrService,
  IReceiptParser,
  ExecutionResult,
  ExecutionLog,
  LogEntry,
  NotificationEntry,
  WebhookData,
  OcrResult,
  ParsedReceipt,
  ParsedReceiptItem,
} from './interfaces';
