import { HttpUploadServer, FileSystem } from '@mhersztowski/core-backend';
import type { IncomingMessage, ServerResponse } from 'http';
import { swaggerSpec } from './swagger.js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import type { IotService } from './iot/IotService.js';

interface CrudConfig {
  filePath: string;
  itemsKey: string;
  typeValue: string;
}

const MINIS_ROOT = 'Minis';

const CRUD_CONFIGS: Record<string, CrudConfig> = {
  users: { filePath: `${MINIS_ROOT}/Admin/Users.json`, itemsKey: 'items', typeValue: 'users' },
  devicedefs: { filePath: `${MINIS_ROOT}/Admin/DeviceDefList.json`, itemsKey: 'deviceDefs', typeValue: 'device_defs' },
  moduledefs: { filePath: `${MINIS_ROOT}/Admin/ModuleDefList.json`, itemsKey: 'moduleDefs', typeValue: 'module_defs' },
  projectdefs: { filePath: `${MINIS_ROOT}/Admin/ProjectDefList.json`, itemsKey: 'projectDefs', typeValue: 'project_defs' },
};

export class MinisHttpServer extends HttpUploadServer {
  private swaggerUiDir: string | null = null;
  private iotService: IotService | null;

  constructor(port: number, fileSystem: FileSystem, iotService?: IotService, staticDir?: string) {
    super(port, fileSystem, undefined, undefined, undefined, staticDir);
    this.iotService = iotService ?? null;
    this.resolveSwaggerUiDir();
  }

  private resolveSwaggerUiDir(): void {
    try {
      const swaggerUiPath = import.meta.resolve('swagger-ui-dist');
      // import.meta.resolve returns a file:// URL
      const resolved = new URL(swaggerUiPath).pathname;
      this.swaggerUiDir = path.dirname(resolved);
    } catch {
      console.warn('swagger-ui-dist not found, /api/docs will not be available');
    }
  }

  protected async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url?.startsWith('/api/')) {
      await this.handleApiRequest(req, res);
      return;
    }

    await super.handleRequest(req, res);
  }

  private async handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const fullApiPath = req.url!.replace(/^\/api/, '');
    const apiPath = fullApiPath.split('?')[0];
    const method = req.method || 'GET';

    // Swagger docs
    if (apiPath === '/docs') {
      res.writeHead(301, { Location: '/api/docs/' });
      res.end();
      return;
    }
    if (apiPath === '/docs/') {
      this.serveSwaggerUi(res);
      return;
    }
    if (apiPath === '/docs/swagger.json') {
      this.sendJsonResponse(res, 200, swaggerSpec);
      return;
    }
    if (apiPath.startsWith('/docs/')) {
      this.serveSwaggerAsset(apiPath.replace('/docs/', ''), res);
      return;
    }

    // Auth
    if (method === 'POST' && apiPath === '/auth/login') {
      await this.handleLogin(req, res);
      return;
    }

    // Def sources upload: POST /admin/{resource}/{id}/sources
    const sourcesMatch = apiPath.match(/^\/admin\/(\w+)\/([^/]+)\/sources$/);
    if (sourcesMatch && method === 'POST') {
      const resource = sourcesMatch[1];
      const defId = decodeURIComponent(sourcesMatch[2]);
      await this.handleUploadDefSources(req, res, resource, defId);
      return;
    }

    // Admin CRUD routes: /admin/{resource} and /admin/{resource}/{id}
    const adminMatch = apiPath.match(/^\/admin\/(\w+)(?:\/(.+))?$/);
    if (adminMatch) {
      const resource = adminMatch[1];
      const id = adminMatch[2] ? decodeURIComponent(adminMatch[2]) : undefined;
      const config = CRUD_CONFIGS[resource];
      if (config) {
        await this.handleCrud(req, res, method, config, id);
        return;
      }
    }

    // IoT endpoints (must be matched BEFORE generic user devices/projects routes)

    // IoT config: /users/{userId}/devices/{deviceId}/iot-config
    const iotConfigMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/iot-config$/);
    if (iotConfigMatch) {
      const userId = decodeURIComponent(iotConfigMatch[1]);
      const deviceId = decodeURIComponent(iotConfigMatch[2]);
      await this.handleIotConfig(req, res, method, userId, deviceId);
      return;
    }

    // IoT telemetry: /users/{userId}/devices/{deviceId}/telemetry[/latest]
    const telemetryMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/telemetry(\/latest)?$/);
    if (telemetryMatch) {
      const userId = decodeURIComponent(telemetryMatch[1]);
      const deviceId = decodeURIComponent(telemetryMatch[2]);
      const isLatest = !!telemetryMatch[3];
      await this.handleIotTelemetry(req, res, method, userId, deviceId, isLatest);
      return;
    }

    // IoT commands: /users/{userId}/devices/{deviceId}/commands
    const commandsMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/commands$/);
    if (commandsMatch) {
      const userId = decodeURIComponent(commandsMatch[1]);
      const deviceId = decodeURIComponent(commandsMatch[2]);
      await this.handleIotCommands(req, res, method, userId, deviceId);
      return;
    }

    // IoT device status: /users/{userId}/iot/devices
    const iotDevicesMatch = apiPath.match(/^\/users\/([^/]+)\/iot\/devices$/);
    if (iotDevicesMatch) {
      const userId = decodeURIComponent(iotDevicesMatch[1]);
      await this.handleIotDevicesList(req, res, method, userId);
      return;
    }

    // IoT alerts: /users/{userId}/alerts[/{id}]
    const alertsMatch = apiPath.match(/^\/users\/([^/]+)\/alerts(?:\/(.+))?$/);
    if (alertsMatch) {
      const userId = decodeURIComponent(alertsMatch[1]);
      const alertId = alertsMatch[2] ? decodeURIComponent(alertsMatch[2]) : undefined;
      await this.handleIotAlerts(req, res, method, userId, alertId);
      return;
    }

    // IoT alert rules: /users/{userId}/alert-rules[/{id}]
    const alertRulesMatch = apiPath.match(/^\/users\/([^/]+)\/alert-rules(?:\/(.+))?$/);
    if (alertRulesMatch) {
      const userId = decodeURIComponent(alertRulesMatch[1]);
      const ruleId = alertRulesMatch[2] ? decodeURIComponent(alertRulesMatch[2]) : undefined;
      await this.handleIotAlertRules(req, res, method, userId, ruleId);
      return;
    }

    // User devices: /users/{userId}/devices and /users/{userId}/devices/{id}
    const userDevicesMatch = apiPath.match(/^\/users\/([^/]+)\/devices(?:\/([^/]+))?$/);
    if (userDevicesMatch) {
      const userId = decodeURIComponent(userDevicesMatch[1]);
      const deviceId = userDevicesMatch[2] ? decodeURIComponent(userDevicesMatch[2]) : undefined;
      await this.handleUserDevices(req, res, method, userId, deviceId);
      return;
    }

    // User projects: /users/{userId}/projects and /users/{userId}/projects/{id}
    const userProjectsMatch = apiPath.match(/^\/users\/([^/]+)\/projects(?:\/([^/]+))?$/);
    if (userProjectsMatch) {
      const userId = decodeURIComponent(userProjectsMatch[1]);
      const projectId = userProjectsMatch[2] ? decodeURIComponent(userProjectsMatch[2]) : undefined;
      await this.handleUserProjects(req, res, method, userId, projectId);
      return;
    }

    this.sendJsonResponse(res, 404, { error: 'API endpoint not found' });
  }

  // --- Auth ---

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseRequestBody(req);
      const { userId, password } = body as { userId: string; password: string };

      if (!userId || !password) {
        this.sendJsonResponse(res, 400, { error: 'userId and password required' });
        return;
      }

      const data = await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`);
      const users = (data as Record<string, unknown[]>).items || [];
      const user = users.find((u: any) => u.id === userId) as any;

      if (!user || user.password !== password) {
        this.sendJsonResponse(res, 401, { error: 'Invalid credentials' });
        return;
      }

      // Return user without password
      const { password: _, ...publicUser } = user;
      this.sendJsonResponse(res, 200, publicUser);
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Generic CRUD ---

  private async handleCrud(req: IncomingMessage, res: ServerResponse, method: string, config: CrudConfig, id?: string): Promise<void> {
    try {
      switch (method) {
        case 'GET':
          if (!id) await this.crudList(res, config);
          else this.sendJsonResponse(res, 405, { error: 'GET with id not supported, use list' });
          break;
        case 'POST':
          if (!id) await this.crudCreate(req, res, config);
          else this.sendJsonResponse(res, 405, { error: 'POST with id not supported' });
          break;
        case 'PUT':
          if (id) await this.crudUpdate(req, res, config, id);
          else this.sendJsonResponse(res, 400, { error: 'PUT requires an id' });
          break;
        case 'DELETE':
          if (id) await this.crudDelete(res, config, id);
          else this.sendJsonResponse(res, 400, { error: 'DELETE requires an id' });
          break;
        default:
          this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async crudList(res: ServerResponse, config: CrudConfig): Promise<void> {
    const data = await this.readJsonFile(config.filePath);
    const items = (data as Record<string, unknown[]>)[config.itemsKey] || [];
    // Strip passwords from users
    const safeItems = config.itemsKey === 'items'
      ? items.map((u: any) => { const { password, ...rest } = u; return rest; })
      : items;
    this.sendJsonResponse(res, 200, { items: safeItems });
  }

  private async crudCreate(req: IncomingMessage, res: ServerResponse, config: CrudConfig): Promise<void> {
    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
    const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

    body.id = body.id || randomUUID();

    // Set type field based on resource
    const TYPE_MAP: Record<string, string> = {
      items: 'user', deviceDefs: 'device_def', moduleDefs: 'module_def',
      projectDefs: 'project_def', devices: 'device', projects: 'minis_project',
    };
    if (TYPE_MAP[config.itemsKey]) body.type = TYPE_MAP[config.itemsKey];

    items.push(body);
    data[config.itemsKey] = items;
    data.type = config.typeValue;
    await this.writeJsonFile(config.filePath, data);

    // Create user directory if creating a user
    if (config.itemsKey === 'items' && body.name) {
      const userDir = `${MINIS_ROOT}/Users/${body.name}/Projects`;
      await this.writeJsonFile(`${userDir}/.gitkeep`, '');
    }

    // Copy project source files from definition when creating a user project
    if (config.itemsKey === 'projects' && body.projectDefId) {
      const userDir = path.dirname(config.filePath);
      const srcPath = `${MINIS_ROOT}/Admin/ProjectsDefs/${body.projectDefId}`;
      const dstPath = `${userDir}/Projects/${body.id}`;
      try {
        const srcTree = await this.fileSystem.listDirectory(srcPath);
        await this.copyTree(srcTree, srcPath, dstPath);
      } catch {
        // Source doesn't exist — no files to copy, directory not needed
      }
    }

    const { password, ...safeBody } = body;
    this.sendJsonResponse(res, 201, config.itemsKey === 'items' ? safeBody : body);
  }

  private async crudUpdate(req: IncomingMessage, res: ServerResponse, config: CrudConfig, id: string): Promise<void> {
    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
    const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      this.sendJsonResponse(res, 404, { error: `Item with id ${id} not found` });
      return;
    }

    items[index] = { ...items[index], ...body, id };
    data[config.itemsKey] = items;
    await this.writeJsonFile(config.filePath, data);

    const result = items[index];
    const { password, ...safeResult } = result;
    this.sendJsonResponse(res, 200, config.itemsKey === 'items' ? safeResult : result);
  }

  private async crudDelete(res: ServerResponse, config: CrudConfig, id: string): Promise<void> {
    const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
    const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      this.sendJsonResponse(res, 404, { error: `Item with id ${id} not found` });
      return;
    }

    items.splice(index, 1);
    data[config.itemsKey] = items;
    await this.writeJsonFile(config.filePath, data);

    // Delete associated directory if it exists
    const sourcesConfig = MinisHttpServer.SOURCES_CONFIG[
      config.itemsKey === 'deviceDefs' ? 'devicedefs' :
      config.itemsKey === 'moduleDefs' ? 'moduledefs' :
      config.itemsKey === 'projectDefs' ? 'projectdefs' : ''
    ];
    if (sourcesConfig) {
      const dirPath = `${sourcesConfig.destDir}/${id}`;
      try {
        await this.fileSystem.deleteDirectory(dirPath);
      } catch {
        // Directory may not exist
      }
    }

    // Delete user project source files directory
    if (config.itemsKey === 'projects') {
      const userDir = path.dirname(config.filePath);
      const projectDir = `${userDir}/Projects/${id}`;
      try {
        await this.fileSystem.deleteDirectory(projectDir);
      } catch {
        // Directory may not exist
      }
    }

    this.sendJsonResponse(res, 200, { success: true });
  }

  // --- User Devices ---

  private async resolveUserName(userId: string): Promise<string | null> {
    const userData = await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`) as Record<string, any[]>;
    const users = userData.items || [];
    const user = users.find((u) => u.id === userId);
    return user ? user.name : null;
  }

  private async handleUserDevices(req: IncomingMessage, res: ServerResponse, method: string, userId: string, deviceId?: string): Promise<void> {
    const userName = await this.resolveUserName(userId);
    if (!userName) {
      this.sendJsonResponse(res, 404, { error: 'User not found' });
      return;
    }

    const config: CrudConfig = {
      filePath: `${MINIS_ROOT}/Users/${userName}/Device.json`,
      itemsKey: 'devices',
      typeValue: 'devices',
    };
    await this.handleCrud(req, res, method, config, deviceId);
  }

  // --- User Projects ---

  private async handleUserProjects(req: IncomingMessage, res: ServerResponse, method: string, userId: string, projectId?: string): Promise<void> {
    const userName = await this.resolveUserName(userId);
    if (!userName) {
      this.sendJsonResponse(res, 404, { error: 'User not found' });
      return;
    }

    const config: CrudConfig = {
      filePath: `${MINIS_ROOT}/Users/${userName}/Project.json`,
      itemsKey: 'projects',
      typeValue: 'projects',
    };
    await this.handleCrud(req, res, method, config, projectId);
  }

  private async copyTree(tree: { name: string; type: string; path: string; children?: any[] }, srcBase: string, dstBase: string): Promise<void> {
    if (tree.type === 'file') {
      const fileData = await this.fileSystem.readFile(tree.path);
      const relativePath = tree.path.substring(srcBase.length);
      await this.fileSystem.writeFile(`${dstBase}${relativePath}`, fileData.content);
      return;
    }
    if (tree.children) {
      for (const child of tree.children) {
        await this.copyTree(child, srcBase, dstBase);
      }
    }
  }

  // --- Def Sources Upload ---

  private static readonly SOURCES_CONFIG: Record<string, { listFile: string; itemsKey: string; destDir: string }> = {
    devicedefs: { listFile: `${MINIS_ROOT}/Admin/DeviceDefList.json`, itemsKey: 'deviceDefs', destDir: `${MINIS_ROOT}/Admin/DeviceDefs` },
    moduledefs: { listFile: `${MINIS_ROOT}/Admin/ModuleDefList.json`, itemsKey: 'moduleDefs', destDir: `${MINIS_ROOT}/Admin/ModuleDefs` },
    projectdefs: { listFile: `${MINIS_ROOT}/Admin/ProjectDefList.json`, itemsKey: 'projectDefs', destDir: `${MINIS_ROOT}/Admin/ProjectsDefs` },
  };

  private async handleUploadDefSources(req: IncomingMessage, res: ServerResponse, resource: string, defId: string): Promise<void> {
    try {
      const config = MinisHttpServer.SOURCES_CONFIG[resource];
      if (!config) {
        this.sendJsonResponse(res, 400, { error: `Upload not supported for ${resource}` });
        return;
      }

      const data = await this.readJsonFile(config.listFile) as Record<string, any>;
      const items = (data[config.itemsKey] || []) as any[];
      const item = items.find((d) => d.id === defId);
      if (!item) {
        this.sendJsonResponse(res, 404, { error: 'Definition not found' });
        return;
      }

      // Read the zip binary from request body
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_ZIP_SIZE) {
            reject(new Error('Zip file too large (max 50MB)'));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', resolve);
        req.on('error', reject);
      });

      const zipBuffer = Buffer.concat(chunks);
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();

      const destPath = `${config.destDir}/${item.id}`;

      // Detect single root directory — if all entries share the same top-level dir, strip it
      const fileEntries = entries.filter((e) => !e.isDirectory && !e.entryName.includes('..'));
      const topLevelDirs = new Set<string>();
      for (const entry of fileEntries) {
        const firstSlash = entry.entryName.indexOf('/');
        if (firstSlash > 0) {
          topLevelDirs.add(entry.entryName.substring(0, firstSlash + 1));
        } else {
          topLevelDirs.clear();
          break;
        }
      }
      const stripPrefix = topLevelDirs.size === 1 ? [...topLevelDirs][0] : '';

      // Extract each file
      let fileCount = 0;
      const textExts = ['.ino', '.blockly', '.json', '.xml', '.txt', '.md', '.h', '.c', '.cpp', '.py', '.html', '.css', '.js'];
      for (const entry of fileEntries) {
        const entryPath = stripPrefix ? entry.entryName.substring(stripPrefix.length) : entry.entryName;
        if (!entryPath) continue;

        const content = entry.getData();
        const filePath = `${destPath}/${entryPath}`;
        const ext = path.extname(entryPath).toLowerCase();

        if (textExts.includes(ext)) {
          await this.fileSystem.writeFile(filePath, content.toString('utf-8'));
        } else {
          const base64 = content.toString('base64');
          await this.fileSystem.writeBinaryFile(filePath, base64, 'application/octet-stream');
        }
        fileCount++;
      }

      this.sendJsonResponse(res, 200, { success: true, filesExtracted: fileCount, path: destPath });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Swagger UI ---

  private serveSwaggerUi(res: ServerResponse): void {
    if (!this.swaggerUiDir) {
      this.sendJsonResponse(res, 503, { error: 'swagger-ui-dist not available' });
      return;
    }
    const indexPath = path.join(this.swaggerUiDir, 'index.html');
    try {
      let html = fs.readFileSync(indexPath, 'utf-8');
      // Replace default petstore URL with our spec
      html = html.replace(
        /https:\/\/petstore\.swagger\.io\/v2\/swagger\.json|https:\/\/petstore3\.swagger\.io\/api\/v3\/openapi\.json/g,
        '/api/docs/swagger.json',
      );
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      this.sendJsonResponse(res, 500, { error: 'Failed to load swagger UI' });
    }
  }

  private serveSwaggerAsset(assetPath: string, res: ServerResponse): void {
    if (!this.swaggerUiDir) {
      this.sendJsonResponse(res, 503, { error: 'swagger-ui-dist not available' });
      return;
    }

    const filePath = path.join(this.swaggerUiDir, assetPath);
    const resolved = path.resolve(filePath);
    const resolvedDir = path.resolve(this.swaggerUiDir);
    if (!resolved.startsWith(resolvedDir)) {
      this.sendJsonResponse(res, 403, { error: 'Forbidden' });
      return;
    }

    try {
      let content: Buffer | string = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      // Replace petstore URL in swagger-initializer.js with our spec
      if (assetPath === 'swagger-initializer.js') {
        content = content.toString('utf-8').replace(
          /https:\/\/petstore\.swagger\.io\/v2\/swagger\.json/g,
          '/api/docs/swagger.json',
        );
      }
      const mimeTypes: Record<string, string> = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.png': 'image/png',
        '.map': 'application/json',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      this.sendJsonResponse(res, 404, { error: 'Asset not found' });
    }
  }

  // --- IoT Config ---

  private async handleIotConfig(req: IncomingMessage, res: ServerResponse, method: string, userId: string, deviceId: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET') {
        const config = this.iotService.telemetry.getConfig(deviceId);
        if (!config) {
          this.sendJsonResponse(res, 404, { error: 'IoT config not found' });
          return;
        }
        this.sendJsonResponse(res, 200, config);
      } else if (method === 'PUT') {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const now = Date.now();
        const existing = this.iotService.telemetry.getConfig(deviceId);
        this.iotService.telemetry.upsertConfig({
          deviceId,
          userId,
          topicPrefix: (body.topicPrefix as string) ?? `minis/${userId}/${deviceId}`,
          heartbeatIntervalSec: (body.heartbeatIntervalSec as number) ?? 60,
          capabilities: (body.capabilities as any[]) ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        const config = this.iotService.telemetry.getConfig(deviceId);
        this.sendJsonResponse(res, 200, config);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Telemetry ---

  private async handleIotTelemetry(req: IncomingMessage, res: ServerResponse, method: string, userId: string, deviceId: string, isLatest: boolean): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      return;
    }
    try {
      if (isLatest) {
        const record = this.iotService.telemetry.getLatest(deviceId);
        this.sendJsonResponse(res, 200, record ?? { message: 'No telemetry data' });
      } else {
        const url = new URL(req.url!, `http://localhost`);
        const from = parseInt(url.searchParams.get('from') ?? '0', 10);
        const to = parseInt(url.searchParams.get('to') ?? String(Date.now()), 10);
        const limit = parseInt(url.searchParams.get('limit') ?? '1000', 10);
        const records = this.iotService.telemetry.getHistory(deviceId, from, to, limit);
        this.sendJsonResponse(res, 200, { items: records });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Commands ---

  private async handleIotCommands(req: IncomingMessage, res: ServerResponse, method: string, userId: string, deviceId: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET') {
        const url = new URL(req.url!, `http://localhost`);
        const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
        const commands = this.iotService.commands.listCommands(deviceId, limit);
        this.sendJsonResponse(res, 200, { items: commands });
      } else if (method === 'POST') {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        if (!body.name) {
          this.sendJsonResponse(res, 400, { error: 'Command name required' });
          return;
        }
        const command = this.iotService.sendCommand(deviceId, body.name as string, (body.payload as Record<string, unknown>) ?? {});
        this.sendJsonResponse(res, 201, command);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Alerts ---

  private async handleIotAlerts(req: IncomingMessage, res: ServerResponse, method: string, userId: string, alertId?: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET' && !alertId) {
        const url = new URL(req.url!, `http://localhost`);
        const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
        const alerts = this.iotService.alerts.listAlerts(userId, limit);
        this.sendJsonResponse(res, 200, { items: alerts });
      } else if (method === 'PATCH' && alertId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const status = body.status as string;
        let alert;
        if (status === 'ACKNOWLEDGED') {
          alert = this.iotService.alerts.acknowledgeAlert(alertId);
        } else if (status === 'RESOLVED') {
          alert = this.iotService.alerts.resolveAlert(alertId);
        } else {
          this.sendJsonResponse(res, 400, { error: 'Invalid status. Use ACKNOWLEDGED or RESOLVED' });
          return;
        }
        if (!alert) {
          this.sendJsonResponse(res, 404, { error: 'Alert not found' });
          return;
        }
        this.sendJsonResponse(res, 200, alert);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Alert Rules ---

  private async handleIotAlertRules(req: IncomingMessage, res: ServerResponse, method: string, userId: string, ruleId?: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET' && !ruleId) {
        const rules = this.iotService.alerts.listRules(userId);
        this.sendJsonResponse(res, 200, { items: rules });
      } else if (method === 'POST' && !ruleId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        if (!body.name || !body.metricKey || !body.conditionOp || body.conditionValue === undefined) {
          this.sendJsonResponse(res, 400, { error: 'name, metricKey, conditionOp, conditionValue required' });
          return;
        }
        const rule = this.iotService.alerts.createRule({
          userId,
          deviceId: body.deviceId as string | undefined,
          metricKey: body.metricKey as string,
          conditionOp: body.conditionOp as any,
          conditionValue: body.conditionValue as number,
          severity: (body.severity as any) ?? 'INFO',
          cooldownMinutes: (body.cooldownMinutes as number) ?? 15,
          isActive: body.isActive !== false,
          name: body.name as string,
        });
        this.sendJsonResponse(res, 201, rule);
      } else if (method === 'PUT' && ruleId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const rule = this.iotService.alerts.updateRule(ruleId, body as any);
        if (!rule) {
          this.sendJsonResponse(res, 404, { error: 'Alert rule not found' });
          return;
        }
        this.sendJsonResponse(res, 200, rule);
      } else if (method === 'DELETE' && ruleId) {
        const deleted = this.iotService.alerts.deleteRule(ruleId);
        if (!deleted) {
          this.sendJsonResponse(res, 404, { error: 'Alert rule not found' });
          return;
        }
        this.sendJsonResponse(res, 200, { success: true });
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Devices List (with status) ---

  private async handleIotDevicesList(req: IncomingMessage, res: ServerResponse, method: string, userId: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      return;
    }
    try {
      const statuses = this.iotService.presence.getAllStatuses();
      const result: Array<{ deviceId: string; status: string; lastSeenAt: number }> = [];
      for (const [deviceId, info] of statuses) {
        result.push({ deviceId, status: info.status, lastSeenAt: info.lastSeenAt });
      }
      this.sendJsonResponse(res, 200, { items: result });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Helpers ---

  private async readJsonFile(filePath: string): Promise<unknown> {
    try {
      const fileData = await this.fileSystem.readFile(filePath);
      return JSON.parse(fileData.content);
    } catch {
      return {};
    }
  }

  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await this.fileSystem.writeFile(filePath, content);
  }

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const MAX_BODY_SIZE = 5 * 1024 * 1024;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          reject(new Error('Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });

      req.on('error', reject);
    });
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Internal server error';
  }
}
