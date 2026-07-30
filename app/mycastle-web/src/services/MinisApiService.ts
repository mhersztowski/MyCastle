import { getHttpUrl } from '@mhersztowski/web-client';
import type {
  UserModel,
  LoginResponse,
  MinisDeviceDefModel,
  MinisDeviceModel,
  DeviceRegistrationRequest,
  MinisLocalizationModel,
  MinisProjectModel,
  MinisProjectLibrary,
  IotDeviceConfig,
  TelemetryRecord,
  DeviceCommand,
  AlertRule,
  Alert,
  DeviceShare,
  ApiKeyPublic,
  ApiKeyCreateResponse,
  SmartDisplayConfig,
  AppSession,
  AppSessionDayStat,
  AppSessionPlatform,
  ProjectTimeStat,
  RetentionPolicy,
  DeviceTwin,
  NotificationChannel,
  IotAutomation,
  IotAutomationTrigger,
  IotAutomationAction,
  VoiceActionCollection,
} from '@mhersztowski/core';

export type { AppSession, AppSessionDayStat, AppSessionPlatform, ProjectTimeStat };

export interface AppSessionWeekEntry {
  session: AppSession;
  days: AppSessionDayStat[];
}

export type UserPublic = Omit<UserModel, 'password'>;

export interface GithubSketchEntry {
  name: string;
  files: string[];
}

export interface GithubProjectEntry {
  id: string;
  name: string;
  description: string;
  softwarePlatform: string | null;
  moduleId: string | null;
  version: string;
  tags: string[];
  path: string;
  hasSrc: boolean;
  hasDocs: boolean;
  sketches: GithubSketchEntry[];
  readmePath: string | null;
  libraries: Array<{ name?: string; version?: string; url?: string; remoteName?: string }>;
  projectScriptPath: string | null;
}

export interface GithubModuleEntry {
  id: string;
  name: string;
  vendor: string;
  description: string;
  platform: string;
  boardProfileKey?: string;
  fqbn?: string;
  arduinoOptions?: Record<string, string>;
}

// ── Git repository (.repo.json) ───────────────────────────────────────────────
export interface RepoJson {
  type: 'git-repo';
  version: number;
  url: string;
  branch?: string;
  tag?: string;
  remote?: string;
  /** Zredagowany na backendzie do '***' gdy ustawiony. */
  token?: string;
  /** Klucz sekretu z SecretsService (namespace `git`). Gdy ustawiony, token jest
   *  przechowywany zaszyfrowany i rozwiązywany przez backend przy każdej operacji. */
  tokenSecretKey?: string;
  lastSync?: number;
}

export interface GitStatus {
  branch: string | null;
  tag: string | null;
  commit: string;
  ahead: number;
  behind: number;
  dirty: boolean;
}

export interface GitInfo {
  isRepo: boolean;
  url: string | null;
  branches: string[];
  remoteBranches: string[];
  tags: string[];
  status: GitStatus | null;
}

export interface GitRepoStatusResponse {
  repo: RepoJson;
  git: GitInfo;
}

export interface GitOpResult {
  ok: boolean;
  output: string;
}


class MinisApiService {
  private authToken: string | null = null;

  private getBaseUrl(): string {
    return getHttpUrl();
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { ...this.getAuthHeaders() };
    if (body) headers['Content-Type'] = 'application/json';

    // Bounded timeout so a slow/hung endpoint (e.g. a device-VFS-backed request
    // waiting on MqttFS) fails fast instead of leaving the caller — and the page —
    // hanging forever. 20 s > MqttFS's 15 s device timeout, so legitimate slow
    // reads still complete.
    let res: Response;
    try {
      res = await fetch(`${this.getBaseUrl()}/api${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(`Request timeout (20s): ${method} ${path}`);
      }
      throw e; // network error ("Failed to fetch") — propagate for the caller to handle
    }

    if (res.status === 401) {
      window.dispatchEvent(new Event('minis:session-expired'));
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Auth (bypasses 401 redirect — login failures should show error, not redirect)
  async login(name: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${this.getBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Public user list (no auth needed — for login page)
  async getPublicUsers(): Promise<UserPublic[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/auth/users`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.items;
  }

  // Admin - Users
  async getUsers(): Promise<UserPublic[]> {
    const data = await this.request<{ items: UserPublic[] }>('GET', '/admin/users');
    return data.items;
  }

  async createUser(user: { name: string; password: string; isAdmin: boolean; roles: string[] }): Promise<UserPublic> {
    return this.request<UserPublic>('POST', '/admin/users', user);
  }

  async updateUser(id: string, user: Partial<UserModel>): Promise<UserPublic> {
    return this.request<UserPublic>('PUT', `/admin/users/${encodeURIComponent(id)}`, user);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request('DELETE', `/admin/users/${encodeURIComponent(id)}`);
  }

  // User - DeviceDefs
  async getDeviceDefs(userName: string): Promise<MinisDeviceDefModel[]> {
    const data = await this.request<{ items: MinisDeviceDefModel[] }>('GET', `/users/${encodeURIComponent(userName)}/devicedefs`);
    return data.items;
  }

  async createDeviceDef(userName: string, def: Omit<MinisDeviceDefModel, 'type' | 'id'>): Promise<MinisDeviceDefModel> {
    return this.request<MinisDeviceDefModel>('POST', `/users/${encodeURIComponent(userName)}/devicedefs`, def);
  }

  async updateDeviceDef(userName: string, id: string, def: Partial<MinisDeviceDefModel>): Promise<MinisDeviceDefModel> {
    return this.request<MinisDeviceDefModel>('PUT', `/users/${encodeURIComponent(userName)}/devicedefs/${encodeURIComponent(id)}`, def);
  }

  async deleteDeviceDef(userName: string, id: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/devicedefs/${encodeURIComponent(id)}`);
  }

  async getGithubProjectdefs(url: string): Promise<{ version: string; updatedAt: string; rawBase: string; projects: GithubProjectEntry[]; modules: GithubModuleEntry[] }> {
    return this.request('GET', `/github-projectdefs?url=${encodeURIComponent(url)}`);
  }

  // User - Devices
  async getUserDevices(userName: string): Promise<MinisDeviceModel[]> {
    const data = await this.request<{ items: MinisDeviceModel[] }>('GET', `/users/${encodeURIComponent(userName)}/devices`);
    return data.items;
  }

  async createUserDevice(userName: string, device: Omit<MinisDeviceModel, 'type' | 'id'>): Promise<MinisDeviceModel> {
    return this.request<MinisDeviceModel>('POST', `/users/${encodeURIComponent(userName)}/devices`, device);
  }

  async updateUserDevice(userName: string, deviceName: string, device: Partial<MinisDeviceModel>): Promise<MinisDeviceModel> {
    return this.request<MinisDeviceModel>('PUT', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}`, device);
  }

  async deleteUserDevice(userName: string, deviceName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}`);
  }

  // User - Device requests (urządzenia proszące o dopisanie do listy)
  async getDeviceRequests(userName: string): Promise<DeviceRegistrationRequest[]> {
    const data = await this.request<{ items: DeviceRegistrationRequest[] }>(
      'GET', `/users/${encodeURIComponent(userName)}/device-requests`,
    );
    return data.items;
  }

  /** Akceptacja tworzy wpis w Electronics → Devices i kasuje zgłoszenie. */
  async approveDeviceRequest(userName: string, deviceName: string): Promise<void> {
    await this.request('POST', `/users/${encodeURIComponent(userName)}/device-requests/${encodeURIComponent(deviceName)}/approve`);
  }

  async rejectDeviceRequest(userName: string, deviceName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/device-requests/${encodeURIComponent(deviceName)}`);
  }

  async getNextSn(): Promise<{ sn: string }> {
    return this.request('GET', '/next-sn');
  }

  async getDeviceMinisConfig(userName: string, deviceName: string): Promise<{ deviceName: string; serialNumber: string; wifiSsid: string; wifiPassword: string }> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/minis-config`);
  }

  // User - Localizations
  async getLocalizations(userName: string): Promise<MinisLocalizationModel[]> {
    const data = await this.request<{ items: MinisLocalizationModel[] }>('GET', `/users/${encodeURIComponent(userName)}/localizations`);
    return data.items ?? [];
  }

  async createLocalization(userName: string, loc: Omit<MinisLocalizationModel, 'type' | 'id'>): Promise<MinisLocalizationModel> {
    return this.request<MinisLocalizationModel>('POST', `/users/${encodeURIComponent(userName)}/localizations`, loc);
  }

  async updateLocalization(userName: string, locId: string, loc: Partial<MinisLocalizationModel>): Promise<MinisLocalizationModel> {
    return this.request<MinisLocalizationModel>('PUT', `/users/${encodeURIComponent(userName)}/localizations/${encodeURIComponent(locId)}`, loc);
  }

  async deleteLocalization(userName: string, locId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/localizations/${encodeURIComponent(locId)}`);
  }

  // User - Projects
  async getUserProjects(userName: string): Promise<MinisProjectModel[]> {
    const data = await this.request<{ items: MinisProjectModel[] }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino`);
    return data.items;
  }

  async createUserProject(userName: string, data: { name: string; githubProjectId?: string; githubRepoUrl?: string; softwarePlatform: string; moduleId?: string; boardProfileKey?: string; libraries?: Array<{ name?: string; version?: string; url?: string; remoteName?: string }> }): Promise<MinisProjectModel> {
    return this.request<MinisProjectModel>('POST', `/users/${encodeURIComponent(userName)}/project-arduino`, data);
  }

  async deleteUserProject(userName: string, projectName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}`);
  }

  async updateProjectLibraries(userName: string, projectName: string, libraries: MinisProjectLibrary[]): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}`, { libraries });
  }

  async updateProjectUseMinisC(userName: string, projectName: string, useMinisC: boolean): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}`, { useMinisC });
  }

  async syncProjectFromGithub(userName: string, projectName: string): Promise<void> {
    await this.request('POST', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/sync-from-github`);
  }

  async pushProjectToGithub(userName: string, projectName: string, token?: string, branch?: string): Promise<{ commitSha: string; fileCount: number }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/push-to-github`, { token, branch });
  }

  async cloneProjectFromGithub(
    userName: string, projectName: string,
    githubRepoUrl: string,
    sketches: GithubSketchEntry[],
    readmePath: string | null,
    libraries?: Array<{ name?: string; version?: string; url?: string; remoteName?: string }>,
    projectScriptPath?: string | null,
  ): Promise<void> {
    await this.request('POST', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/clone-from-github`, { githubRepoUrl, sketches, readmePath, libraries, projectScriptPath });
  }

  async getProjectScript(userName: string, projectName: string): Promise<string | null> {
    try {
      const data = await this.request<{ content: string }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/project-script`);
      return data.content;
    } catch {
      return null;
    }
  }

  async saveProjectScript(userName: string, projectName: string, content: string): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/project-script`, { content });
  }
  // IoT - Config
  async getIotConfig(userName: string, deviceName: string): Promise<IotDeviceConfig | null> {
    try {
      return await this.request<IotDeviceConfig>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-config`);
    } catch {
      return null;
    }
  }

  async getIotExtensions(userName: string, deviceName: string): Promise<Array<{ type: string }>> {
    try {
      const res = await this.request<{ extensions: Array<{ type: string }> }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-extensions`);
      return res.extensions;
    } catch {
      return [];
    }
  }

  async getSmartDisplayConfig(userName: string, deviceName: string): Promise<SmartDisplayConfig> {
    return this.request<SmartDisplayConfig>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/smart-display`);
  }

  async saveSmartDisplayConfig(userName: string, deviceName: string, config: SmartDisplayConfig): Promise<SmartDisplayConfig> {
    return this.request<SmartDisplayConfig>('PUT', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/smart-display`, config);
  }

  // App sessions (admin only)
  async getAppSessions(userId?: string): Promise<AppSession[]> {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await this.request<{ sessions: AppSession[] }>('GET', `/admin/app-sessions${qs}`);
    return data.sessions;
  }

  async getAppSessionsWeekly(userId?: string): Promise<AppSessionWeekEntry[]> {
    const qs = `?weekly=true${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
    const data = await this.request<{ stats: AppSessionWeekEntry[] }>('GET', `/admin/app-sessions${qs}`);
    return data.stats;
  }

  async getProjectTimeStats(userId?: string): Promise<ProjectTimeStat[]> {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await this.request<{ stats: ProjectTimeStat[] }>('GET', `/admin/app-sessions/project-time${qs}`);
    return data.stats;
  }

  async saveIotConfig(userName: string, deviceName: string, config: Partial<IotDeviceConfig>): Promise<IotDeviceConfig> {
    return this.request<IotDeviceConfig>('PUT', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-config`, config);
  }

  // IoT - Telemetry
  async getTelemetryLatest(userName: string, deviceName: string): Promise<TelemetryRecord | { message: string }> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/telemetry/latest`);
  }

  async getTelemetryHistory(userName: string, deviceName: string, from: number, to: number, limit = 1000): Promise<TelemetryRecord[]> {
    const data = await this.request<{ items: TelemetryRecord[] }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/telemetry?from=${from}&to=${to}&limit=${limit}`);
    return data.items;
  }

  // IoT - Commands
  async sendCommand(userName: string, deviceName: string, name: string, payload: Record<string, unknown> = {}): Promise<DeviceCommand> {
    return this.request<DeviceCommand>('POST', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/commands`, { name, payload });
  }

  async extRequest(userName: string, deviceName: string, extType: string, payload: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/ext/${extType}`, payload);
  }

  async getCommands(userName: string, deviceName: string, limit = 50): Promise<DeviceCommand[]> {
    const data = await this.request<{ items: DeviceCommand[] }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/commands?limit=${limit}`);
    return data.items;
  }

  // IoT - Alert Rules
  async getAlertRules(userName: string): Promise<AlertRule[]> {
    const data = await this.request<{ items: AlertRule[] }>('GET', `/users/${encodeURIComponent(userName)}/alert-rules`);
    return data.items;
  }

  async createAlertRule(userName: string, rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
    return this.request<AlertRule>('POST', `/users/${encodeURIComponent(userName)}/alert-rules`, rule);
  }

  async updateAlertRule(userName: string, ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    return this.request<AlertRule>('PUT', `/users/${encodeURIComponent(userName)}/alert-rules/${encodeURIComponent(ruleId)}`, updates);
  }

  async deleteAlertRule(userName: string, ruleId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/alert-rules/${encodeURIComponent(ruleId)}`);
  }

  // IoT - Alerts
  async getAlerts(userName: string, limit = 100): Promise<Alert[]> {
    const data = await this.request<{ items: Alert[] }>('GET', `/users/${encodeURIComponent(userName)}/alerts?limit=${limit}`);
    return data.items;
  }

  async acknowledgeAlert(userName: string, alertId: string): Promise<Alert> {
    return this.request<Alert>('PATCH', `/users/${encodeURIComponent(userName)}/alerts/${encodeURIComponent(alertId)}`, { status: 'ACKNOWLEDGED' });
  }

  async resolveAlert(userName: string, alertId: string): Promise<Alert> {
    return this.request<Alert>('PATCH', `/users/${encodeURIComponent(userName)}/alerts/${encodeURIComponent(alertId)}`, { status: 'RESOLVED' });
  }

  // IoT - Device Status
  async getIotDevices(userName: string): Promise<Array<{ deviceId: string; status: string; lastSeenAt: number }>> {
    const data = await this.request<{ items: Array<{ deviceId: string; status: string; lastSeenAt: number }> }>('GET', `/users/${encodeURIComponent(userName)}/iot/devices`);
    return data.items;
  }

  // IoT - Device Sharing
  async getDeviceShares(userName: string, deviceName: string): Promise<DeviceShare[]> {
    const data = await this.request<{ items: DeviceShare[] }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/shares`);
    return data.items;
  }

  async createDeviceShare(userName: string, deviceName: string, targetUserId: string): Promise<DeviceShare> {
    return this.request<DeviceShare>('POST', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/shares`, { targetUserId });
  }

  async deleteDeviceShare(userName: string, deviceName: string, shareId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/shares/${encodeURIComponent(shareId)}`);
  }

  async getSharedDevices(userName: string): Promise<DeviceShare[]> {
    const data = await this.request<{ items: DeviceShare[] }>('GET', `/users/${encodeURIComponent(userName)}/shared-devices`);
    return data.items;
  }

  async getMyShares(userName: string): Promise<DeviceShare[]> {
    const data = await this.request<{ items: DeviceShare[] }>('GET', `/users/${encodeURIComponent(userName)}/my-shares`);
    return data.items;
  }

  // Electronics - Configuration
  async getIotArchitecture(userName: string): Promise<{ nodes: unknown[]; edges: unknown[]; updatedAt: number } | null> {
    try {
      return await this.request('GET', `/users/${encodeURIComponent(userName)}/electronics/configuration`);
    } catch {
      return null;
    }
  }

  async saveIotArchitecture(userName: string, arch: { nodes: unknown[]; edges: unknown[]; updatedAt: number }): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/electronics/configuration`, arch);
  }

  // Voice Actions (Aura Edytor Konwersacji) — per-user, zapisywane w backendzie.
  async getVoiceActions(userName: string): Promise<VoiceActionCollection> {
    return await this.request('GET', `/users/${encodeURIComponent(userName)}/voice-actions`);
  }

  async saveVoiceActions(userName: string, data: VoiceActionCollection): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/voice-actions`, data);
  }

  // UML — generate/update a UML project from source code (backend uses @mhersztowski/devtools).
  // `dir` is a user-root-relative path (e.g. `Projects/cpp/HelloWorld` or `drive/...`).
  // Pass the current project to sync (diff + history commit); omit it to generate fresh.
  /** `files` (ścieżki względem `dir`) zawęża źródło do wybranych plików; brak = cały katalog. */
  async syncUmlFromCode<P = unknown>(userName: string, dir: string, project?: P, name?: string, files?: string[]): Promise<{ project: P; changes: Array<{ kind: string; target: string; symbol?: string; member?: string; from?: string; to?: string }>; summary: string; committed: boolean }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/uml/sync`, { dir, name, project, files });
  }

  // API Keys
  async getApiKeys(userName: string): Promise<ApiKeyPublic[]> {
    const data = await this.request<{ items: ApiKeyPublic[] }>('GET', `/users/${encodeURIComponent(userName)}/api-keys`);
    return data.items;
  }

  async createApiKey(userName: string, name: string): Promise<ApiKeyCreateResponse> {
    return this.request<ApiKeyCreateResponse>('POST', `/users/${encodeURIComponent(userName)}/api-keys`, { name });
  }

  async deleteApiKey(userName: string, keyId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/api-keys/${encodeURIComponent(keyId)}`);
  }

  // Secrets / credentials — server-side, encrypted at rest (AES-256-GCM).
  // Backed by the per-user `plugin-secrets` store, scoped by a namespace.
  async listSecrets(userName: string, namespace: string): Promise<Array<{ key: string; shared: boolean; updatedAt: number }>> {
    const data = await this.request<{ items: Array<{ key: string; shared: boolean; updatedAt: number }> }>(
      'GET', `/users/${encodeURIComponent(userName)}/plugin-secrets/${encodeURIComponent(namespace)}`);
    return data.items;
  }

  async getSecret(userName: string, namespace: string, key: string): Promise<{ key: string; value: string; shared: boolean }> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/plugin-secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`);
  }

  async setSecret(userName: string, namespace: string, key: string, value: string, shared = false): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/plugin-secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, { value, shared });
  }

  async deleteSecret(userName: string, namespace: string, key: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/plugin-secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`);
  }

  // Arduino
  async getArduinoBoards(): Promise<Array<{ fqbn: string; name: string }>> {
    const data = await this.request<{ items: Array<{ fqbn: string; name: string }> }>('GET', '/arduino/boards');
    return data.items;
  }

  async getArduinoPorts(): Promise<Array<{ address: string; protocol: string; boardName?: string }>> {
    const data = await this.request<{ items: Array<{ address: string; protocol: string; boardName?: string }> }>('GET', '/arduino/ports');
    return data.items;
  }

  async compileProject(userName: string, projectName: string, sketchName: string, fqbn: string, deviceName?: string): Promise<{
    success: boolean; output: string; exitCode: number; outputFiles?: string[];
  }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/compile`, {
      sketchName, fqbn, ...(deviceName ? { deviceName } : {}),
    });
  }

  /** Returns the URL to the compiled WASM JS loader (serves sketch.js from the backend). */
  getArduinoWasmJsUrl(userName: string, projectName: string, sketchName: string): string {
    return `${getHttpUrl()}/api/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/wasm/${encodeURIComponent(sketchName)}/sketch.js`;
  }

  /** SSE URL for WASM build streaming — returns the full URL (used with EventSource + Auth header via fetch). */
  getArduinoWasmBuildSseUrl(userName: string, projectName: string, sketchName: string): string {
    return `/api/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/build-wasm?sketchName=${encodeURIComponent(sketchName)}`;
  }

  // C++ projects (filesystem-based, not in Project.json)

  async listCppProjects(userName: string): Promise<Array<{ name: string }>> {
    const res = await this.request<{ projects: Array<{ name: string }> }>('GET', `/users/${encodeURIComponent(userName)}/cpp-projects`);
    return res.projects;
  }

  async createCppProject(userName: string, name: string): Promise<{ name: string }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/cpp-projects`, { name });
  }

  async deleteCppProject(userName: string, name: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/cpp-projects/${encodeURIComponent(name)}`);
  }

  getCppWasmJsUrl(userName: string, projectName: string, sketchName: string): string {
    return `${getHttpUrl()}/api/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/wasm/${encodeURIComponent(sketchName)}/sketch.js`;
  }

  getCppWasmBuildSseUrl(userName: string, projectName: string, sketchName: string): string {
    return `/api/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/build-wasm?sketchName=${encodeURIComponent(sketchName)}`;
  }

  // C++ sketch files

  async listCppSketches(userName: string, projectName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/sketches`);
    return data.items;
  }

  async listCppSketchFiles(userName: string, projectName: string, sketchName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}`);
    return data.items;
  }

  async readCppSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<string> {
    const data = await this.request<{ content: string }>('GET', `/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
    return data.content;
  }

  async writeCppSketchFile(userName: string, projectName: string, sketchName: string, fileName: string, content: string): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`, { content });
  }

  async deleteCppSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/project-cpp/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
  }

  async uploadFirmware(userName: string, projectName: string, sketchName: string, fqbn: string, port: string): Promise<{
    success: boolean; output: string; exitCode: number;
  }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/upload`, {
      sketchName, fqbn, port,
    });
  }

  // Sketch files
  async listSketches(userName: string, projectName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/sketches`);
    return data.items;
  }

  async listSketchFiles(userName: string, projectName: string, sketchName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}`);
    return data.items;
  }

  async readSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<string> {
    const data = await this.request<{ content: string }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
    return data.content;
  }

  async writeSketchFile(userName: string, projectName: string, sketchName: string, fileName: string, content: string): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`, { content });
  }

  async deleteSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
  }

  // uPython sketch files
  async listUpythonSketches(userName: string, projectName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/sketches`);
    return data.items;
  }

  async listUpythonSketchFiles(userName: string, projectName: string, sketchName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}`);
    return data.items;
  }

  async readUpythonSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<string> {
    const data = await this.request<{ content: string }>('GET', `/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
    return data.content;
  }

  async writeUpythonSketchFile(userName: string, projectName: string, sketchName: string, fileName: string, content: string): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`, { content });
  }

  async deleteUpythonSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
  }

  // Pico SDK build
  async buildPicoSdkProject(userName: string, projectName: string, sketchName: string, boardKey = 'pico2'): Promise<{
    success: boolean; output: string; exitCode: number; uf2Url?: string;
  }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/build-pico`, { sketchName, boardKey });
  }

  // Pygame sketch files
  async listPygameSketches(userName: string, projectName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectName)}/sketches`);
    return data.items;
  }

  async readPygameSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<string> {
    const data = await this.request<{ content: string }>('GET', `/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
    return data.content;
  }

  async writePygameSketchFile(userName: string, projectName: string, sketchName: string, fileName: string, content: string): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`, { content });
  }

  async listPygameSketchFiles(userName: string, projectName: string, sketchName: string): Promise<string[]> {
    const data = await this.request<{ items: string[] }>('GET', `/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}`);
    return data.items;
  }

  async deletePygameSketchFile(userName: string, projectName: string, sketchName: string, fileName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectName)}/sketches/${encodeURIComponent(sketchName)}/${encodeURIComponent(fileName)}`);
  }

  async buildPygameSketch(userName: string, projectId: string, sketchName: string, webCode: string): Promise<{ success: boolean; output: string }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectId)}/sketches/${encodeURIComponent(sketchName)}/build`, { code: webCode });
  }

  getPygameWebBuildUrl(userName: string, projectId: string, sketchName: string): string {
    return `/api/users/${encodeURIComponent(userName)}/project-pygame/${encodeURIComponent(projectId)}/sketches/${encodeURIComponent(sketchName)}/web-build/index.html`;
  }

  async readProjectReadme(userName: string, projectName: string): Promise<string | null> {
    try {
      const data = await this.request<{ content: string }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/readme`);
      return data.content;
    } catch {
      return null;
    }
  }

  async writeProjectReadme(userName: string, projectName: string, content: string): Promise<void> {
    await this.request('PUT', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/readme`, { content });
  }

  async getProjectOutput(userName: string, projectName: string): Promise<Array<{ name: string; size: number }>> {
    const data = await this.request<{ items: Array<{ name: string; size: number }> }>('GET', `/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/output`);
    return data.items;
  }

  async getTerminalTicket(): Promise<{ ticket: string }> {
    return this.request<{ ticket: string }>('POST', '/terminal/ticket');
  }

  // Admin - Scripts
  async listScripts(): Promise<{ name: string; size: number; updatedAt: string }[]> {
    const data = await this.request<{ scripts: { name: string; size: number; updatedAt: string }[] }>('GET', '/admin/scripts');
    return data.scripts;
  }

  async getScript(name: string): Promise<string> {
    const data = await this.request<{ content: string }>('GET', `/admin/scripts/${encodeURIComponent(name)}`);
    return data.content;
  }

  async putScript(name: string, content: string): Promise<void> {
    await this.request('PUT', `/admin/scripts/${encodeURIComponent(name)}`, { content });
  }

  async deleteScript(name: string): Promise<void> {
    await this.request('DELETE', `/admin/scripts/${encodeURIComponent(name)}`);
  }

  async runScript(name: string): Promise<{ stdout: string; stderr: string; exitCode: number | null; duration: number }> {
    return this.request('POST', `/admin/scripts/${encodeURIComponent(name)}/run`);
  }

  async generateDocs(): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
    return this.request('POST', '/admin/docs/generate');
  }

  async generateScreenshots(opts: { user?: string; pass?: string; base?: string } = {}): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
    return this.request('POST', '/admin/screenshots/generate', opts);
  }

  /** Fetch a compiled output file as binary string (for esptool-js). */
  async fetchOutputBinary(userName: string, projectName: string, fileName: string): Promise<string> {
    const res = await fetch(`${this.getBaseUrl()}/api/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectName)}/output/${encodeURIComponent(fileName)}`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch ${fileName}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    // Convert ArrayBuffer to binary string for esptool-js
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  async listFirmwareFiles(): Promise<Array<{ name: string; size: number }>> {
    return this.request<{ items: Array<{ name: string; size: number }> }>('GET', '/admin/firmware')
      .then(r => r.items);
  }

  async fetchFirmwareFile(fileName: string): Promise<string> {
    const res = await fetch(`${this.getBaseUrl()}/api/admin/firmware/${encodeURIComponent(fileName)}`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch firmware ${fileName}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  async getAnthropicKey(): Promise<string> {
    const res = await this.request<{ apiKey: string }>('GET', '/config/anthropic-key');
    return res.apiKey ?? '';
  }

  async cleanupOrphanProjects(userName: string): Promise<{ removed: string[]; kept: string[] }> {
    return this.request<{ removed: string[]; kept: string[] }>('POST', `/users/${encodeURIComponent(userName)}/cleanup-projects`);
  }

  // --- Retention Policy ---

  async getRetentionPolicies(userName: string, deviceName?: string): Promise<{ policies: RetentionPolicy[]; effective: RetentionPolicy | null }> {
    const path = deviceName
      ? `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-retention`
      : `/users/${encodeURIComponent(userName)}/iot-retention`;
    return this.request('GET', path);
  }

  async setRetentionPolicy(userName: string, retentionDays: number, deviceName?: string): Promise<void> {
    const path = deviceName
      ? `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-retention`
      : `/users/${encodeURIComponent(userName)}/iot-retention`;
    await this.request('PUT', path, { retentionDays });
  }

  async deleteRetentionPolicy(userName: string, deviceName?: string): Promise<void> {
    const path = deviceName
      ? `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-retention`
      : `/users/${encodeURIComponent(userName)}/iot-retention`;
    await this.request('DELETE', path);
  }

  // --- Device Twin ---

  async getDeviceTwin(userName: string, deviceName: string): Promise<DeviceTwin & { delta: Record<string, { desired: unknown; reported: unknown }> }> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/twin`);
  }

  async patchDeviceTwinDesired(userName: string, deviceName: string, desired: Record<string, unknown>): Promise<DeviceTwin & { delta: Record<string, { desired: unknown; reported: unknown }> }> {
    return this.request('PUT', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/twin`, { desired });
  }

  // --- Notification Channels ---

  async listNotificationChannels(userName: string): Promise<NotificationChannel[]> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/notification-channels`);
  }

  async createNotificationChannel(userName: string, data: { name: string; webhookUrl: string; secret?: string }): Promise<NotificationChannel> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/notification-channels`, data);
  }

  async updateNotificationChannel(userName: string, channelId: string, patch: Partial<{ name: string; webhookUrl: string; secret: string | null; isActive: boolean }>): Promise<NotificationChannel> {
    return this.request('PUT', `/users/${encodeURIComponent(userName)}/notification-channels/${encodeURIComponent(channelId)}`, patch);
  }

  async deleteNotificationChannel(userName: string, channelId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/notification-channels/${encodeURIComponent(channelId)}`);
  }

  // --- IoT Automations ---

  async listIotAutomations(userName: string): Promise<IotAutomation[]> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/iot-automations`);
  }

  async createIotAutomation(userName: string, data: { name: string; trigger: IotAutomationTrigger; actions: IotAutomationAction[]; enabled?: boolean }): Promise<IotAutomation> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/iot-automations`, data);
  }

  async updateIotAutomation(userName: string, automationId: string, patch: Partial<{ name: string; enabled: boolean; trigger: IotAutomationTrigger; actions: IotAutomationAction[] }>): Promise<IotAutomation> {
    return this.request('PUT', `/users/${encodeURIComponent(userName)}/iot-automations/${encodeURIComponent(automationId)}`, patch);
  }

  async deleteIotAutomation(userName: string, automationId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/iot-automations/${encodeURIComponent(automationId)}`);
  }

  // ── Git repository (.repo.json) ─────────────────────────────────────────────
  /** Status repo: RepoJson + gałęzie/tagi/status git. `repoPath` to ścieżka pliku
   *  `.repo.json` względem drive użytkownika (np. `myrepo/.repo.json`). */
  async getGitInfo(userName: string, repoPath: string): Promise<GitRepoStatusResponse> {
    const q = new URLSearchParams({ path: repoPath }).toString();
    return this.request('GET', `/users/${encodeURIComponent(userName)}/git/info?${q}`);
  }

  /** Zapisuje konfigurację repo (URL/remote/branch/token) do `.repo.json`. */
  async gitSaveRepo(userName: string, repoPath: string, patch: { url?: string; remote?: string; branch?: string; token?: string; tokenSecretKey?: string | null }): Promise<{ ok: boolean; repo: RepoJson }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/save`, { path: repoPath, ...patch });
  }

  async gitClone(userName: string, repoPath: string): Promise<GitOpResult> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/clone`, { path: repoPath });
  }

  async gitCheckout(userName: string, repoPath: string, ref: string, type: 'branch' | 'tag'): Promise<GitOpResult> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/checkout`, { path: repoPath, ref, type });
  }

  async gitPull(userName: string, repoPath: string): Promise<GitOpResult> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/pull`, { path: repoPath });
  }

  async gitPush(userName: string, repoPath: string): Promise<GitOpResult> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/push`, { path: repoPath });
  }

  /** Lista plików w repo na podanym ref (lub working tree gdy ref puste). */
  async gitListFiles(userName: string, repoPath: string, ref?: string): Promise<string[]> {
    const q = new URLSearchParams({ path: repoPath, ...(ref ? { ref } : {}) }).toString();
    const r = await this.request<{ files: string[] }>('GET', `/users/${encodeURIComponent(userName)}/git/files?${q}`);
    return r.files;
  }

  /** Unified diff. `to` puste = working tree (filesystem backendu) vs `from`. */
  async gitDiff(userName: string, repoPath: string, opts: { from?: string; to?: string; file?: string }): Promise<{ ok: boolean; diff: string }> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/diff`, { path: repoPath, ...opts });
  }

  async gitCommit(userName: string, repoPath: string, message: string): Promise<GitOpResult> {
    return this.request('POST', `/users/${encodeURIComponent(userName)}/git/commit`, { path: repoPath, message });
  }

  async miniscCompile(source: string): Promise<{ bytecode: number[]; size: number; disasm: string }> {
    return this.request('POST', '/minisc/compile', { source });
  }
}

export const minisApi = new MinisApiService();
