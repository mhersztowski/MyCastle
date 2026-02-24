import { HttpUploadServer, FileSystem } from '@mhersztowski/core-backend';
import type { IncomingMessage, ServerResponse } from 'http';
import { swaggerSpec } from './swagger.js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

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

  constructor(port: number, fileSystem: FileSystem, staticDir?: string) {
    super(port, fileSystem, undefined, undefined, undefined, staticDir);
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
    const apiPath = req.url!.replace(/^\/api/, '');
    const method = req.method || 'GET';

    // Swagger docs
    if (apiPath === '/docs' || apiPath === '/docs/') {
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

    // User devices: /users/{userId}/devices and /users/{userId}/devices/{id}
    const userDevicesMatch = apiPath.match(/^\/users\/([^/]+)\/devices(?:\/(.+))?$/);
    if (userDevicesMatch) {
      const userId = decodeURIComponent(userDevicesMatch[1]);
      const deviceId = userDevicesMatch[2] ? decodeURIComponent(userDevicesMatch[2]) : undefined;
      await this.handleUserDevices(req, res, method, userId, deviceId);
      return;
    }

    // User projects: /users/{userId}/projects and /users/{userId}/projects/{name}
    const userProjectsMatch = apiPath.match(/^\/users\/([^/]+)\/projects(?:\/(.+))?$/);
    if (userProjectsMatch) {
      const userId = decodeURIComponent(userProjectsMatch[1]);
      const projectName = userProjectsMatch[2] ? decodeURIComponent(userProjectsMatch[2]) : undefined;
      if (method === 'GET' && !projectName) {
        await this.handleGetUserProjects(res, userId);
        return;
      }
      if (method === 'POST' && !projectName) {
        await this.handleCreateUserProject(req, res, userId);
        return;
      }
      if (method === 'DELETE' && projectName) {
        await this.handleDeleteUserProject(res, userId, projectName);
        return;
      }
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
    if (config.itemsKey === 'items') body.type = 'user';
    else if (config.itemsKey === 'deviceDefs') body.type = 'device_def';
    else if (config.itemsKey === 'moduleDefs') body.type = 'module_def';
    else if (config.itemsKey === 'projectDefs') body.type = 'project_def';

    items.push(body);
    data[config.itemsKey] = items;
    data.type = config.typeValue;
    await this.writeJsonFile(config.filePath, data);

    // Create user directory if creating a user
    if (config.itemsKey === 'items' && body.name) {
      const userDir = `${MINIS_ROOT}/Users/${body.name}/Projects`;
      await this.writeJsonFile(`${userDir}/.gitkeep`, '');
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
    try {
      const userName = await this.resolveUserName(userId);
      if (!userName) {
        this.sendJsonResponse(res, 404, { error: 'User not found' });
        return;
      }

      const filePath = `${MINIS_ROOT}/Users/${userName}/Device.json`;

      switch (method) {
        case 'GET': {
          if (deviceId) {
            this.sendJsonResponse(res, 405, { error: 'GET with id not supported, use list' });
            return;
          }
          const data = await this.readJsonFile(filePath) as Record<string, unknown>;
          const devices = (data.devices || []) as unknown[];
          this.sendJsonResponse(res, 200, { items: devices });
          return;
        }
        case 'POST': {
          if (deviceId) {
            this.sendJsonResponse(res, 405, { error: 'POST with id not supported' });
            return;
          }
          const body = await this.parseRequestBody(req) as Record<string, unknown>;
          const data = await this.readJsonFile(filePath) as Record<string, unknown>;
          const devices = (data.devices || []) as Record<string, unknown>[];
          body.id = body.id || randomUUID();
          body.type = 'device';
          devices.push(body);
          data.devices = devices;
          data.type = 'devices';
          await this.writeJsonFile(filePath, data);
          this.sendJsonResponse(res, 201, body);
          return;
        }
        case 'PUT': {
          if (!deviceId) {
            this.sendJsonResponse(res, 400, { error: 'PUT requires an id' });
            return;
          }
          const body = await this.parseRequestBody(req) as Record<string, unknown>;
          const data = await this.readJsonFile(filePath) as Record<string, unknown>;
          const devices = (data.devices || []) as Record<string, unknown>[];
          const index = devices.findIndex((d) => d.id === deviceId);
          if (index === -1) {
            this.sendJsonResponse(res, 404, { error: `Device with id ${deviceId} not found` });
            return;
          }
          devices[index] = { ...devices[index], ...body, id: deviceId };
          data.devices = devices;
          await this.writeJsonFile(filePath, data);
          this.sendJsonResponse(res, 200, devices[index]);
          return;
        }
        case 'DELETE': {
          if (!deviceId) {
            this.sendJsonResponse(res, 400, { error: 'DELETE requires an id' });
            return;
          }
          const data = await this.readJsonFile(filePath) as Record<string, unknown>;
          const devices = (data.devices || []) as Record<string, unknown>[];
          const index = devices.findIndex((d) => d.id === deviceId);
          if (index === -1) {
            this.sendJsonResponse(res, 404, { error: `Device with id ${deviceId} not found` });
            return;
          }
          devices.splice(index, 1);
          data.devices = devices;
          await this.writeJsonFile(filePath, data);
          this.sendJsonResponse(res, 200, { success: true });
          return;
        }
        default:
          this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- User Projects ---

  private async handleGetUserProjects(res: ServerResponse, userId: string): Promise<void> {
    try {
      const userName = await this.resolveUserName(userId);
      if (!userName) {
        this.sendJsonResponse(res, 404, { error: 'User not found' });
        return;
      }

      // List project directories under Users/{userName}/Projects/
      const projectsPath = `${MINIS_ROOT}/Users/${userName}/Projects`;
      try {
        const tree = await this.fileSystem.listDirectory(projectsPath);
        const projects = (tree.children || [])
          .filter((child) => child.type === 'directory')
          .map((child) => ({
            type: 'minis_project',
            id: child.name,
            name: child.name,
            projectDefId: child.name,
          }));
        this.sendJsonResponse(res, 200, { items: projects });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleCreateUserProject(req: IncomingMessage, res: ServerResponse, userId: string): Promise<void> {
    try {
      const body = await this.parseRequestBody(req) as { projectDefId: string };
      if (!body.projectDefId) {
        this.sendJsonResponse(res, 400, { error: 'projectDefId required' });
        return;
      }

      const userName = await this.resolveUserName(userId);
      if (!userName) {
        this.sendJsonResponse(res, 404, { error: 'User not found' });
        return;
      }

      const srcPath = `${MINIS_ROOT}/Admin/ProjectsDefs/${body.projectDefId}`;
      const dstPath = `${MINIS_ROOT}/Users/${userName}/Projects/${body.projectDefId}`;

      // Copy project files from definition to user directory
      try {
        const srcTree = await this.fileSystem.listDirectory(srcPath);
        await this.copyTree(srcTree, srcPath, dstPath);
      } catch {
        // If source doesn't exist, just create the directory
        await this.writeJsonFile(`${dstPath}/.gitkeep`, '');
      }

      this.sendJsonResponse(res, 201, {
        type: 'minis_project',
        id: body.projectDefId,
        name: body.projectDefId,
        projectDefId: body.projectDefId,
      });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleDeleteUserProject(res: ServerResponse, userId: string, projectName: string): Promise<void> {
    try {
      const userName = await this.resolveUserName(userId);
      if (!userName) {
        this.sendJsonResponse(res, 404, { error: 'User not found' });
        return;
      }

      const projectPath = `${MINIS_ROOT}/Users/${userName}/Projects/${projectName}`;
      try {
        await this.fileSystem.deleteDirectory(projectPath);
      } catch {
        // Directory may not exist
      }
      this.sendJsonResponse(res, 200, { success: true });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
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
      const content = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
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
