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
  email_list,
  email_read,
  email_send,
  mail_send,
  mail_inbox,
  mail_outbox,
  zip_pack,
  zip_unpack,
  zip_update,
  zip_delete,
  project_arduino_build,
  project_arduino_get_output,
  project_picosdk_build,
  project_picosdk_get_output,
  iot_get_devices,
  iot_device_command,
  iot_device_telemetry,
  iot_device_ext_command,
  iot_device_ext_vfs_stat,
  iot_device_ext_vfs_readdir,
  iot_device_ext_vfs_readfile,
  iot_device_ext_vfs_writefile,
  iot_device_ext_vfs_delete,
  iot_device_ext_vfs_rename,
  iot_device_ext_vfs_mkdir,
  server_get_config,
  SCRIPT_ENV,
  iot_log_info,
  iot_log_warnning,
  iot_log_warning,
  iot_log_error,
  http_add_endpoint,
  http_remove_endpoint,
  http_list_endpoints,
} from './api';
export type {
  ConnResponse, ResCallback, ErrCallback, IotDevice, ServerConfig,
  HttpEndpointHandler, HttpEndpointReply,
  IotCommandStatus, IotVfsStat, IotVfsEntry, IotVfsFileData, IotVfsOk,
} from './api';

// server — realizacja API backendu (HTTP + MQTT)
export { ServerApi, ServerLogic, GitTool, HttpEndpointError, SERVER_CMD_TOPIC, clientResTopic } from './server/api';
export type {
  ServerLogicOptions,
  SecretsProvider,
  DispatchContext,
  IotProvider,
  IotDeviceInfo,
  IotCommandResult,
  MqttBus,
  ServerCommand,
  ServerResponse,
  ServerPush,
  ServerCmdBody,
  EndpointCallResult,
  HttpEndpointRequest,
  HttpEndpointResponse,
  IotLogLevel,
  IotLogPacket,
  GitResult,
  GitDiffResult,
  GitCommit,
  EmailSummary,
  EmailMessage,
  EmailAttachmentMeta,
  EmailSendResult,
  EmailSendOptions,
  Mail,
  ZipResult,
  ProjectBuildResult,
} from './server/api';

// projects — arduino / upython / pygame / picosdk (przeniesione z app/mycastle-backend)
export { ArduinoService, ArduinoWasmBuilder, ArduinoCliLocal, ArduinoCliDocker, ArduinoProject } from './projects/arduino/index';
export type {
  WasmBuildResult,
  ArduinoServiceConfig,
  ArduinoCli,
  BoardInfo,
  CompileOptions,
  CompileResult,
  PortInfo,
  UploadOptions,
  UploadResult,
} from './projects/arduino/index';
export type { MinisConfig } from './projects/arduino/ArduinoCli';
export { MicroPythonService, MicroPythonCliLocal, MicroPythonProject } from './projects/upython/index';
export type {
  MicroPythonServiceConfig,
  MicroPythonCli,
  DeployOptions,
  DeployResult,
} from './projects/upython/index';
export { PygameService } from './projects/pygame/index';
export type { PygameBuildResult, PygameServiceConfig } from './projects/pygame/index';
export { PicoSdkService } from './projects/picosdk/index';
export type { PicoSdkServiceConfig, PicoSdkBuildResult } from './projects/picosdk/index';

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
