/**
 * MyCastle UI Screenshot Script
 *
 * Captures screenshots of all major pages with interface descriptions.
 * Run after starting both dev servers:
 *   pnpm dev:backend  (port 1894)
 *   pnpm dev:web      (port 1895)
 *
 * Usage:
 *   npx playwright test tests/screenshots/take-screenshots.ts --config tests/screenshots/playwright.config.ts
 *
 * Output: tests/screenshots/output/
 */

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'app', 'mycastle-web', 'public', 'screenshots');
const ADMIN_USER = process.env.SCREENSHOT_USER ?? 'marcin';
const ADMIN_PASS = process.env.SCREENSHOT_PASS ?? '';
const BASE = process.env.SCREENSHOT_BASE ?? 'http://localhost:1895';

// --- helpers ---

async function loginAs(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login/${user}`);
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|user)\//);
}

async function shot(page: Page, name: string, description: string) {
  // wait for network idle so async renders finish
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });

  const mdPath = path.join(OUTPUT_DIR, `${name}.md`);
  const url = page.url();
  fs.writeFileSync(
    mdPath,
    `# ${name}\n\n**URL:** \`${url}\`\n\n## Interface Description\n\n${description}\n`,
  );
  console.log(`✓ ${name}`);
}

// --- tests ---

test.describe('MyCastle Screenshots', () => {
  test.setTimeout(120_000);

  test('01 - Home Page (user selection)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await shot(
      page,
      '01-home-page',
      `## Home Page — User Selection Screen

The entry point of MyCastle. Shows a card grid of registered users.

**Elements:**
- **User cards** — one card per registered user, showing avatar initials + username. Clicking navigates to the login page for that user.
- **App title** — "MyCastle" header at the top.
- **Dark/light theme** — controlled from the top-right corner (toggle button, stored in localStorage).

**Purpose:** Allows multiple users on the same MyCastle instance to select their account before entering a password.`,
    );
  });

  test('02 - Login Page', async ({ page }) => {
    await page.goto(`${BASE}/login/${ADMIN_USER}`);
    await page.waitForLoadState('networkidle');
    await shot(
      page,
      '02-login-page',
      `## Login Page

Password entry form for a specific user (user name is embedded in the URL).

**Elements:**
- **Username display** — shows the selected user's name (read-only).
- **Password field** — plain text masked input. Submitting logs the user in.
- **Login button** — triggers POST /api/auth/login. On success, JWT token stored in sessionStorage and user redirected to their dashboard.
- **Back button** — returns to the Home Page (user selection).

**Auth flow:** JWT token valid 7 days. Admins land on \`/admin/{user}/main\`, regular users on \`/user/{user}/main\`.`,
    );
  });

  test('03 - Admin Dashboard', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.waitForURL(/\/admin\//);
    await shot(
      page,
      '03-admin-dashboard',
      `## Admin Dashboard — Main Page

The home screen for admin users after login.

**Layout:**
- **Left navigation drawer** — collapsible sidebar with grouped sections: Overview, Users, Device Definitions, Module Definitions, Project Definitions, Tools (RPC Explorer, MQTT Explorer, API Keys, Test VFS, Docs).
- **Top app bar** — MyCastle logo, current user name, theme toggle, account menu (impersonation, global windows: API Docs, RPC, MQTT, Terminal).
- **Main area** — summary cards / quick-access tiles.

**Admin-only features:** CRUD for users, device definitions, module definitions, project definition import from GitHub.`,
    );
  });

  test('04 - Admin Users List', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/admin/${ADMIN_USER}/users`);
    await shot(
      page,
      '04-admin-users',
      `## Admin — Users Management

Lists all registered users. Admins can create, edit, and delete user accounts.

**Elements:**
- **User table** — columns: Username, Role (admin/user), Actions.
- **Add User button** — opens a dialog to create a new user (username + password + role).
- **Edit / Delete** per-row actions — edit password/role or remove the user account.

**Security note:** Admin can impersonate any user (from AccountMenu → Impersonate) to inspect their data without knowing their password.`,
    );
  });

  test('05 - Admin Device Definitions', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/admin/${ADMIN_USER}/devicesdefs`);
    await shot(
      page,
      '05-admin-device-defs',
      `## Admin — Device Definitions

Manages board/hardware profiles used across projects.

**Elements:**
- **Definitions table** — columns: Key, Name, Architecture, Board (FQBN), Description, Actions.
- **Add Definition** — creates a new hardware profile (e.g. \`esp32s3_pico\` = ESP32-S3 with specific FQBN).
- **Edit / Delete** — modify or remove a definition.

**Used by:** Arduino and uPython projects reference a \`boardProfileKey\` from this list to select the correct compiler settings.`,
    );
  });

  test('06 - User Main Dashboard', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/main`);
    await shot(
      page,
      '06-user-dashboard',
      `## User Dashboard — Main Page

The home screen for a regular user. Same layout as admin but with a limited navigation menu.

**Navigation sections:**
- **Electronics** — Arduino projects, uPython projects, Pygame projects, IoT devices, configuration
- **PIM (Personal Information Manager)** — Calendar, Todo list, Contacts, Projects, Shopping list, Automate flows, Agent chat, Settings
- **Tools** — accessible based on role (RPC/MQTT only for admins)

**Top bar:** Breadcrumb, user name, account menu.`,
    );
  });

  test('07 - Electronics Devices', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/electronics/devices`);
    await shot(
      page,
      '07-electronics-devices',
      `## Electronics — User Devices

Lists all electronics devices registered to this user.

**Elements:**
- **Device cards / table** — device name, description, localization, last build info (platform, success, timestamp).
- **Add Device** — create a new device (name, description, board profile, localization).
- **Per-device actions** — edit, delete, open IoT dashboard for that device.

**Device types:** Registered devices can appear on the IoT dashboard, have Arduino/uPython sketches compiled and deployed, and publish MQTT telemetry.`,
    );
  });

  test('08 - Electronics Arduino Projects', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/electronics/arduino`);
    await shot(
      page,
      '08-electronics-arduino',
      `## Electronics — Arduino Projects

Lists all Arduino (C++) projects for this user.

**Elements:**
- **Project list** — project name, board profile, associated device, last compile status.
- **Add Project** — create a new Arduino project (name, board profile key, device assignment).
- **Open / Compile** — open the project editor (Arduino Blockly + Monaco Code), or trigger a compile via Docker arduino-cli.
- **Clone from GitHub** — import project skeleton from a GitHub repository URL.

**Build flow:** Compile → arduino-cli inside Docker → .bin artifact → Flash via Web Serial API (in-browser) or OTA.`,
    );
  });

  test('09 - Electronics uPython Projects', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/electronics/upython`);
    await shot(
      page,
      '09-electronics-upython',
      `## Electronics — MicroPython Projects

Lists all MicroPython projects for this user.

**Elements:**
- **Project list** — project name, board profile, associated device.
- **Add Project** — create a new uPython project.
- **Open** — opens the MicroPython project editor (uPython Blockly + Monaco Code split view).
- **Deploy** — deploys .py files to the device via mpremote (over USB serial or WebREPL) using Docker.

**Libraries:** Projects can declare libraries (by name/version or raw URL). Libraries are fetched and deployed to the device before the main code.`,
    );
  });

  test('10 - Electronics Pygame Projects', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/electronics/pygame`);
    await shot(
      page,
      '10-electronics-pygame',
      `## Electronics — Pygame Projects

Lists all Pygame (Python) projects for this user.

**Elements:**
- **Project list** — project name, last build status.
- **Add Project** — create a new Pygame project.
- **Open** — opens the Pygame project editor (Pygame Blockly + Monaco Code split view, mode toggle: native/web).
- **Build** — runs pygbag (via Docker or local install) to produce a WebAssembly build.
- **Preview** — opens built web app in an iframe inside the page.`,
    );
  });

  test('11 - IoT Dashboard', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/iot/dashboard`);
    await shot(
      page,
      '11-iot-dashboard',
      `## IoT — Dashboard

Real-time overview of all IoT devices for this user.

**Elements:**
- **Device status cards** — online/offline indicator (green/red dot), last heartbeat timestamp, telemetry values (temperature, humidity, etc.).
- **Send Command** — opens a dialog to send a named command with optional payload to a specific device.
- **Alert rules** — summary of active alert conditions.

**MQTT:** Devices publish heartbeats every N seconds. Backend tracks presence; devices appear offline after TTL expires. Telemetry stored in SQLite via TelemetryStore.`,
    );
  });

  test('12 - IoT Device Detail', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/iot/devices`);
    await shot(
      page,
      '12-iot-devices-list',
      `## IoT — Devices List

Table of all IoT devices with their current status.

**Columns:** Device name, Status (online/offline), Last seen, Description, Localization, Actions.

**Actions per device:**
- Open detail page (telemetry history, entities, commands)
- Smart Display config (if device has smart-display extension)
- Virtual Display viewer (if device has display extension)

**Extensions shown:** Each device card lists its active extensions (vfs, smart-display, display) based on the hello payload received from the device.`,
    );
  });

  test('13 - Electronics Configuration (Network Editor)', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/electronics/configuration`);
    await shot(
      page,
      '13-electronics-config',
      `## Electronics — Network Configuration (ReactFlow Editor)

Visual editor for the IoT network topology.

**Node types:**
- **wifi-device** — ESP32 or similar device directly on WiFi
- **wifi-uart-bridge** — device that bridges WiFi to UART
- **wifi-switch** — a WiFi-controlled relay/switch
- **uart-device** — device connected via UART to a bridge

**Elements:**
- **ReactFlow canvas** — drag-and-drop network topology editor. Nodes connected by edges represent physical connectivity.
- **Config panel** — right-click a node or select from dropdown to view/edit WiFi SSID/password, serial number, device name. WiFi credentials are inherited from the closest wifi parent node.
- **Save** — persists configuration via PUT /api/users/{user}/electronics/configuration.

**Used by:** ArduinoProject, uPythonProject inject WiFi credentials and device SN at compile/deploy time based on this topology.`,
    );
  });

  test('14 - PIM Calendar', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/pim/calendar`);
    await shot(
      page,
      '14-pim-calendar',
      `## PIM — Calendar

Personal calendar with events loaded from the filesystem.

**Elements:**
- **Monthly/weekly view** — calendar grid with colored event blocks.
- **Add event** — create a new event (title, date/time, duration, description).
- **Event click** — open event detail/edit dialog.

**Storage:** Events stored as JSON files in the user's personal data directory on the server, loaded via MQTT or REST API.`,
    );
  });

  test('15 - PIM Todo List', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/pim/todolist`);
    await shot(
      page,
      '15-pim-todolist',
      `## PIM — Todo List

Task management with nested tasks and priority levels.

**Elements:**
- **Task tree** — hierarchical list. Tasks can have subtasks (expand/collapse).
- **Add Task** — inline form to add a new task (title, priority, due date).
- **Check off** — checkbox to mark as done (task grays out).
- **Edit / Delete** — per-task context menu or inline actions.

**Storage:** Tasks stored as JSON on the server filesystem.`,
    );
  });

  test('16 - Workspace Editor (Monaco + VFS)', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/pim/editor`);
    await shot(
      page,
      '16-workspace-editor',
      `## Workspace — Personal Data Editor (Monaco + VFS)

A VS Code-like environment for browsing and editing personal files on the server.

**Layout (left to right):**
1. **Activity Bar** — vertical icon strip: Explorer, Search, Extensions (planned).
2. **Sidebar** — VFS file explorer tree with context menu (New File, New Folder, Rename, Delete, Copy/Paste).
3. **Editor area** — tabbed multi-editor. Supports split editor (multiple groups side-by-side). Monaco Editor for code/text files, Markdown preview, image viewer.
4. **Status bar** — current file path, language mode, cursor position.

**File system mounts:**
- \`/home/\` → user's personal data directory on the server
- \`/server/\` → full server filesystem (admin only)

**Agent panel (right side, admin only):** AI assistant powered by Claude. Can read/write files in the VFS, create projects, generate code.`,
    );
  });

  test('17 - Automate Designer', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/designer/automate`);
    await shot(
      page,
      '17-automate-designer',
      `## Automate — Visual Flow Designer

Node-based visual programming environment (NodeRED-like) for creating automation flows.

**Elements:**
- **Canvas** — drag-and-drop graph editor. Nodes connected by edges define data flow.
- **Node palette** — left panel with available node types: Trigger, Condition, Action, Merge, HTTP, MQTT, Transform, etc.
- **Properties panel** — right panel, shows configuration fields for the selected node.
- **Run button** — executes the flow on the backend (AutomateEngine).
- **Save** — persists the flow as JSON.

**Runtime:** Flows run on the backend (BackendAutomateEngine). Merge node waits for all inputs before forwarding. Manual Trigger nodes can be invoked from the UI.`,
    );
  });

  test('18 - AI Agent Chat', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/pim/agent`);
    await shot(
      page,
      '18-agent-chat',
      `## PIM — AI Agent Chat

Conversational AI assistant (Claude) with tool calling and VFS access.

**Elements:**
- **Message thread** — chat history with user and assistant messages. Supports markdown rendering, code blocks, image attachments.
- **Input field** — text input with attachment button (image upload as base64).
- **Send / Stop** — send message or abort current generation (streaming).
- **Model selector** — choose AI provider (Anthropic, OpenAI, Ollama) and model.
- **History persistence** — conversation saved as ChatSession JSON in VFS.

**Capabilities:** The agent can read/write files in the VFS, execute tools defined in \`skills-lock.json\`, create and edit projects, generate code, and answer questions about the user's data.`,
    );
  });

  test('19 - API Keys Management', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/tools/api-keys`);
    await shot(
      page,
      '19-api-keys',
      `## Tools — API Keys Management (Admin)

Create and manage API keys for programmatic access to the MyCastle API.

**Elements:**
- **Keys table** — columns: Key prefix (e.g. \`minis_abc123…\`), Created at, Last used, Actions.
- **Generate key** — creates a new API key (full key shown once at creation, then only prefix stored as SHA-256 hash).
- **Revoke** — deletes the key, immediately invalidating it.

**Usage:** API keys can be used as MQTT passwords (for IoT devices) or as Bearer tokens in HTTP requests. Format: \`Authorization: Bearer minis_xxxx\`.`,
    );
  });

  test('20 - IoT Alerts', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/iot/alerts`);
    await shot(
      page,
      '20-iot-alerts',
      `## IoT — Alerts

Define and view alert rules triggered by device telemetry.

**Elements:**
- **Alert rules list** — each rule: device, metric key, operator (>, <, ==), threshold, label.
- **Add Rule** — create a new alert rule (device + metric + condition + threshold).
- **Active alerts log** — recent alerts that were triggered, with timestamp and value that triggered them.
- **Delete rule** — remove an alert condition.

**Evaluation:** AlertEngine evaluates each incoming telemetry reading against all rules for that device. Fires an alert event when condition is met.`,
    );
  });

  test('21 - IoT Emulator', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/iot/emulator`);
    await shot(
      page,
      '21-iot-emulator',
      `## IoT — Device Emulator

Simulates virtual IoT devices that publish MQTT telemetry and heartbeats — useful for testing dashboards and alert rules without physical hardware.

**Elements:**
- **Preset selector** — predefined emulator profiles (temperature sensor, switch, multi-sensor, etc.).
- **Device config** — device name, user, telemetry intervals.
- **Start / Stop** — connect/disconnect the virtual device to the MQTT broker.
- **Activity log** — scrolling list of recent MQTT messages published by the emulator.
- **Telemetry generators** — random-walk values, sine waves, or fixed values per metric key.

**Persistence:** Emulator state saved in localStorage.`,
    );
  });

  test('22 - RPC Explorer', async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`${BASE}/user/${ADMIN_USER}/tools/rpc`);
    await shot(
      page,
      '22-rpc-explorer',
      `## Tools — RPC Explorer (Admin)

Interactive UI for calling backend RPC methods directly.

**Elements:**
- **Method list** — all registered RPC methods (ping, getDeviceStatuses, sendCommand, getLatestTelemetry).
- **Input form** — auto-generated form from Zod schema. Fields may have autocomplete (e.g. username, device name with dependsOn links).
- **Call button** — sends POST /api/rpc/{method}.
- **Response panel** — formatted JSON response.

**Used for:** Debugging, manual device commands, status checks without full UI.`,
    );
  });
});
