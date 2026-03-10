import zodToJsonSchema from 'zod-to-json-schema';
import type { RpcMethodDef } from '@mhersztowski/core';
import type { RpcRouter } from '@mhersztowski/core-backend';

function rpcMethodToSwaggerPath(name: string, def: RpcMethodDef): Record<string, unknown> {
  const inputSchema = zodToJsonSchema(def.input, { target: 'openApi3' }) as Record<string, unknown>;
  const outputSchema = zodToJsonSchema(def.output, { target: 'openApi3' }) as Record<string, unknown>;
  delete inputSchema.$schema;
  delete outputSchema.$schema;

  // Inject fieldMeta as OpenAPI extensions
  if (def.fieldMeta && inputSchema.properties) {
    const props = inputSchema.properties as Record<string, Record<string, unknown>>;
    for (const [field, meta] of Object.entries(def.fieldMeta)) {
      if (props[field]) {
        if (meta.autocomplete) props[field]['x-autocomplete'] = meta.autocomplete;
        if (meta.dependsOn) props[field]['x-depends-on'] = meta.dependsOn;
      }
    }
  }

  return {
    post: {
      tags: def.tags ?? ['RPC'],
      summary: def.description ?? name,
      operationId: `rpc_${name}`,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: inputSchema } },
      },
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean', enum: [true] },
                  result: outputSchema,
                },
              },
            },
          },
        },
        400: { description: 'Validation error' },
        404: { description: 'Method not found' },
        500: { description: 'Handler error' },
      },
    },
  };
}

export function buildSwaggerSpec(rpcRouter?: RpcRouter): typeof swaggerSpec {
  const spec = JSON.parse(JSON.stringify(swaggerSpec));
  if (rpcRouter) {
    for (const { name, def } of rpcRouter.getRegisteredMethods()) {
      spec.paths[`/rpc/${name}`] = rpcMethodToSwaggerPath(name, def);
    }
  }
  return spec;
}

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Minis API',
    description: 'REST API for Minis DIY platform',
    version: '1.0.0',
  },
  servers: [{ url: '/api' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'password'],
                properties: {
                  name: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        security: [],
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'JWT token' },
                    user: { $ref: '#/components/schemas/UserPublic' },
                  },
                },
              },
            },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin - Users'],
        summary: 'List all users',
        responses: {
          200: {
            description: 'User list',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/UserPublic' } } } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin - Users'],
        summary: 'Create user',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserCreate' } } },
        },
        responses: { 201: { description: 'User created' } },
      },
    },
    '/admin/users/{id}': {
      put: {
        tags: ['Admin - Users'],
        summary: 'Update user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserCreate' } } },
        },
        responses: { 200: { description: 'User updated' } },
      },
      delete: {
        tags: ['Admin - Users'],
        summary: 'Delete user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User deleted' } },
      },
    },
    '/admin/devicedefs': {
      get: {
        tags: ['Admin - DeviceDefs'],
        summary: 'List device definitions',
        responses: { 200: { description: 'DeviceDef list' } },
      },
      post: {
        tags: ['Admin - DeviceDefs'],
        summary: 'Create device definition',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceDef' } } },
        },
        responses: { 201: { description: 'DeviceDef created' } },
      },
    },
    '/admin/devicedefs/{id}': {
      put: {
        tags: ['Admin - DeviceDefs'],
        summary: 'Update device definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceDef' } } },
        },
        responses: { 200: { description: 'DeviceDef updated' } },
      },
      delete: {
        tags: ['Admin - DeviceDefs'],
        summary: 'Delete device definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'DeviceDef deleted' } },
      },
    },
    '/admin/moduledefs': {
      get: {
        tags: ['Admin - ModuleDefs'],
        summary: 'List module definitions',
        responses: { 200: { description: 'ModuleDef list' } },
      },
      post: {
        tags: ['Admin - ModuleDefs'],
        summary: 'Create module definition',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ModuleDef' } } },
        },
        responses: { 201: { description: 'ModuleDef created' } },
      },
    },
    '/admin/moduledefs/{id}': {
      put: {
        tags: ['Admin - ModuleDefs'],
        summary: 'Update module definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ModuleDef' } } },
        },
        responses: { 200: { description: 'ModuleDef updated' } },
      },
      delete: {
        tags: ['Admin - ModuleDefs'],
        summary: 'Delete module definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ModuleDef deleted' } },
      },
    },
    '/admin/projectdefs': {
      get: {
        tags: ['Admin - ProjectDefs'],
        summary: 'List project definitions',
        responses: { 200: { description: 'ProjectDef list' } },
      },
      post: {
        tags: ['Admin - ProjectDefs'],
        summary: 'Create project definition',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectDef' } } },
        },
        responses: { 201: { description: 'ProjectDef created' } },
      },
    },
    '/admin/projectdefs/{id}': {
      put: {
        tags: ['Admin - ProjectDefs'],
        summary: 'Update project definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectDef' } } },
        },
        responses: { 200: { description: 'ProjectDef updated' } },
      },
      delete: {
        tags: ['Admin - ProjectDefs'],
        summary: 'Delete project definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ProjectDef deleted' } },
      },
    },
    '/users/{userName}/projects': {
      get: {
        tags: ['User - Projects'],
        summary: 'List user projects',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project list' } },
      },
      post: {
        tags: ['User - Projects'],
        summary: 'Create user project',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['name', 'projectDefId'], properties: { name: { type: 'string' }, projectDefId: { type: 'string' } } },
            },
          },
        },
        responses: { 201: { description: 'Project created' } },
      },
    },
    '/users/{userName}/projects/{id}': {
      put: {
        tags: ['User - Projects'],
        summary: 'Update user project',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, projectDefId: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Project updated' } },
      },
      delete: {
        tags: ['User - Projects'],
        summary: 'Delete user project',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Project deleted' } },
      },
    },

    // --- IoT ---

    '/users/{userName}/devices/{deviceName}/iot-config': {
      get: {
        tags: ['IoT - Config'],
        summary: 'Get IoT device configuration',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'IoT config', content: { 'application/json': { schema: { $ref: '#/components/schemas/IotDeviceConfig' } } } },
          404: { description: 'Config not found' },
        },
      },
      put: {
        tags: ['IoT - Config'],
        summary: 'Create or update IoT device configuration',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IotDeviceConfigInput' } } },
        },
        responses: { 200: { description: 'Config saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/IotDeviceConfig' } } } } },
      },
    },
    '/users/{userName}/devices/{deviceName}/telemetry': {
      get: {
        tags: ['IoT - Telemetry'],
        summary: 'Get telemetry history',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'integer', description: 'Start timestamp (ms)' } },
          { name: 'to', in: 'query', schema: { type: 'integer', description: 'End timestamp (ms)' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 1000 } },
        ],
        responses: {
          200: {
            description: 'Telemetry records',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/TelemetryRecord' } } } } } },
          },
        },
      },
    },
    '/users/{userName}/devices/{deviceName}/telemetry/latest': {
      get: {
        tags: ['IoT - Telemetry'],
        summary: 'Get latest telemetry record',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Latest telemetry', content: { 'application/json': { schema: { $ref: '#/components/schemas/TelemetryRecord' } } } },
        },
      },
    },
    '/users/{userName}/devices/{deviceName}/commands': {
      get: {
        tags: ['IoT - Commands'],
        summary: 'List commands for device',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: {
            description: 'Command list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DeviceCommand' } } } } } },
          },
        },
      },
      post: {
        tags: ['IoT - Commands'],
        summary: 'Send command to device',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' }, payload: { type: 'object' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Command created', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceCommand' } } } } },
      },
    },
    '/users/{userName}/alert-rules': {
      get: {
        tags: ['IoT - Alert Rules'],
        summary: 'List alert rules for user',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Alert rules list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/AlertRule' } } } } } },
          },
        },
      },
      post: {
        tags: ['IoT - Alert Rules'],
        summary: 'Create alert rule',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRuleInput' } } },
        },
        responses: { 201: { description: 'Rule created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRule' } } } } },
      },
    },
    '/users/{userName}/alert-rules/{ruleId}': {
      put: {
        tags: ['IoT - Alert Rules'],
        summary: 'Update alert rule',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'ruleId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRuleInput' } } },
        },
        responses: {
          200: { description: 'Rule updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRule' } } } },
          404: { description: 'Rule not found' },
        },
      },
      delete: {
        tags: ['IoT - Alert Rules'],
        summary: 'Delete alert rule',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'ruleId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Rule deleted' },
          404: { description: 'Rule not found' },
        },
      },
    },
    '/users/{userName}/alerts': {
      get: {
        tags: ['IoT - Alerts'],
        summary: 'List alerts for user',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: {
          200: {
            description: 'Alerts list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Alert' } } } } } },
          },
        },
      },
    },
    '/users/{userName}/alerts/{alertId}': {
      patch: {
        tags: ['IoT - Alerts'],
        summary: 'Acknowledge or resolve alert',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'alertId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ACKNOWLEDGED', 'RESOLVED'] } } },
            },
          },
        },
        responses: {
          200: { description: 'Alert updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } } },
          400: { description: 'Invalid status' },
          404: { description: 'Alert not found' },
        },
      },
    },
    '/users/{userName}/devices/{deviceName}/shares': {
      get: {
        tags: ['IoT - Device Sharing'],
        summary: 'List shares for a device',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Device shares list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DeviceShare' } } } } } },
          },
        },
      },
      post: {
        tags: ['IoT - Device Sharing'],
        summary: 'Share device with another user',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['targetUserId'], properties: { targetUserId: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Share created', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceShare' } } } } },
      },
    },
    '/users/{userName}/devices/{deviceName}/shares/{shareId}': {
      delete: {
        tags: ['IoT - Device Sharing'],
        summary: 'Remove a device share',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'shareId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Share removed' }, 404: { description: 'Share not found' } },
      },
    },
    '/users/{userName}/shared-devices': {
      get: {
        tags: ['IoT - Device Sharing'],
        summary: 'List devices shared with this user',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Shared device list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DeviceShare' } } } } } },
          },
        },
      },
    },
    '/users/{userName}/iot/devices': {
      get: {
        tags: ['IoT - Devices'],
        summary: 'List IoT devices with online/offline status',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Device status list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/IotDeviceStatus' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/scripts': {
      get: {
        tags: ['Admin - Scripts'],
        summary: 'List available server-side scripts',
        responses: {
          200: {
            description: 'Script list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scripts: { type: 'array', items: { $ref: '#/components/schemas/ScriptInfo' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/scripts/{name}': {
      get: {
        tags: ['Admin - Scripts'],
        summary: 'Get script content',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Script filename (e.g. hello.js)' }],
        responses: {
          200: {
            description: 'Script content',
            content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } } } } },
          },
          400: { description: 'Invalid script name' },
          404: { description: 'Script not found' },
        },
      },
      put: {
        tags: ['Admin - Scripts'],
        summary: 'Create or update a script',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['content'], properties: { content: { type: 'string', description: 'JavaScript source code' } } },
            },
          },
        },
        responses: { 200: { description: 'Script saved' }, 400: { description: 'Invalid name or missing content' } },
      },
      delete: {
        tags: ['Admin - Scripts'],
        summary: 'Delete a script',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Script deleted' }, 400: { description: 'Script not found or invalid name' } },
      },
    },
    '/admin/scripts/{name}/run': {
      post: {
        tags: ['Admin - Scripts'],
        summary: 'Run a script (Node.js subprocess, timeout 30s)',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  args: { type: 'array', items: { type: 'string' }, description: 'Command-line arguments passed to the script' },
                  env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Extra environment variables' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Run result',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ScriptRunResult' } } },
          },
          400: { description: 'Script not found or invalid name' },
          503: { description: 'Scripts service not available' },
        },
      },
    },
    '/terminal/ticket': {
      post: {
        tags: ['Terminal'],
        summary: 'Create a one-time terminal auth ticket (valid 30s)',
        responses: {
          200: {
            description: 'Ticket created',
            content: { 'application/json': { schema: { type: 'object', properties: { ticket: { type: 'string' } } } } },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/ai/search': {
      post: {
        tags: ['AI'],
        summary: 'Proxy AI search request to OpenAI or Anthropic',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['model', 'apiKey', 'userPrompt'],
                properties: {
                  model: { type: 'string', enum: ['openai', 'anthropic'] },
                  apiKey: { type: 'string' },
                  systemPrompt: { type: 'string' },
                  userPrompt: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'AI response',
            content: { 'application/json': { schema: { type: 'object', properties: { result: { type: 'string' } } } } },
          },
          400: { description: 'Invalid request' },
          500: { description: 'AI API error' },
        },
      },
    },
    '/admin/devicedefs/{id}/sources': {
      post: {
        tags: ['Admin - DeviceDefs'],
        summary: 'Upload source ZIP for device definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
        },
        responses: { 200: { description: 'Sources uploaded' }, 400: { description: 'Invalid file' } },
      },
    },
    '/admin/moduledefs/{id}/sources': {
      post: {
        tags: ['Admin - ModuleDefs'],
        summary: 'Upload source ZIP for module definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
        },
        responses: { 200: { description: 'Sources uploaded' }, 400: { description: 'Invalid file' } },
      },
    },
    '/admin/projectdefs/{id}/sources': {
      post: {
        tags: ['Admin - ProjectDefs'],
        summary: 'Upload source ZIP for project definition',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
        },
        responses: { 200: { description: 'Sources uploaded' }, 400: { description: 'Invalid file' } },
      },
    },
    '/users/{userName}/devices': {
      get: {
        tags: ['User - Devices'],
        summary: 'List user devices',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Device list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Device' } } } } } },
          },
        },
      },
      post: {
        tags: ['User - Devices'],
        summary: 'Create user device',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceInput' } } },
        },
        responses: { 201: { description: 'Device created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Device' } } } } },
      },
    },
    '/users/{userName}/devices/{deviceName}': {
      put: {
        tags: ['User - Devices'],
        summary: 'Update user device',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceInput' } } },
        },
        responses: { 200: { description: 'Device updated' }, 404: { description: 'Device not found' } },
      },
      delete: {
        tags: ['User - Devices'],
        summary: 'Delete user device',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deviceName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Device deleted' }, 404: { description: 'Device not found' } },
      },
    },
    '/users/{userName}/my-shares': {
      get: {
        tags: ['IoT - Device Sharing'],
        summary: 'List shares created by this user',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'My shares list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DeviceShare' } } } } } },
          },
        },
      },
    },
    '/users/{userName}/localizations': {
      get: {
        tags: ['User - Localizations'],
        summary: 'List user localizations',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Localization list',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Localization' } } } } } },
          },
        },
      },
      post: {
        tags: ['User - Localizations'],
        summary: 'Create localization',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LocalizationInput' } } },
        },
        responses: { 201: { description: 'Localization created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Localization' } } } } },
      },
    },
    '/users/{userName}/localizations/{id}': {
      put: {
        tags: ['User - Localizations'],
        summary: 'Update localization',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LocalizationInput' } } },
        },
        responses: { 200: { description: 'Localization updated' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['User - Localizations'],
        summary: 'Delete localization',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Localization deleted' }, 404: { description: 'Not found' } },
      },
    },
    '/arduino/boards': {
      get: {
        tags: ['Arduino'],
        summary: 'List available Arduino boards',
        responses: {
          200: {
            description: 'Board list',
            content: { 'application/json': { schema: { type: 'object', properties: { boards: { type: 'array', items: { $ref: '#/components/schemas/ArduinoBoard' } } } } } },
          },
          503: { description: 'Arduino CLI not available' },
        },
      },
    },
    '/arduino/ports': {
      get: {
        tags: ['Arduino'],
        summary: 'List available serial ports',
        responses: {
          200: {
            description: 'Port list',
            content: { 'application/json': { schema: { type: 'object', properties: { ports: { type: 'array', items: { type: 'object', properties: { address: { type: 'string' }, protocol: { type: 'string' } } } } } } } },
          },
          503: { description: 'Arduino CLI not available' },
        },
      },
    },
    '/users/{userName}/projects/{projectName}/compile': {
      post: {
        tags: ['Arduino - Projects'],
        summary: 'Compile Arduino sketch',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sketchName', 'fqbn'], properties: { sketchName: { type: 'string' }, fqbn: { type: 'string' } } } } },
        },
        responses: {
          200: { description: 'Compile result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ArduinoCompileResult' } } } },
          400: { description: 'Compile error' },
          503: { description: 'Arduino CLI not available' },
        },
      },
    },
    '/users/{userName}/projects/{projectName}/upload': {
      post: {
        tags: ['Arduino - Projects'],
        summary: 'Upload firmware to device',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['sketchName', 'fqbn', 'port'], properties: { sketchName: { type: 'string' }, fqbn: { type: 'string' }, port: { type: 'string' } } },
            },
          },
        },
        responses: {
          200: { description: 'Upload result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ArduinoCompileResult' } } } },
          400: { description: 'Upload error' },
          503: { description: 'Arduino CLI not available' },
        },
      },
    },
    '/users/{userName}/projects/{projectName}/output': {
      get: {
        tags: ['Arduino - Projects'],
        summary: 'List compiled output files',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Output file list',
            content: { 'application/json': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } } } } },
          },
        },
      },
    },
    '/users/{userName}/projects/{projectName}/output/{fileName}': {
      get: {
        tags: ['Arduino - Projects'],
        summary: 'Download compiled output file',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'fileName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Binary file content', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          404: { description: 'File not found' },
        },
      },
    },
    '/users/{userName}/projects/{projectName}/readme': {
      get: {
        tags: ['Arduino - Projects'],
        summary: 'Get project README',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'README content', content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string' } } } } } },
        },
      },
      put: {
        tags: ['Arduino - Projects'],
        summary: 'Save project README',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'README saved' } },
      },
    },
    '/users/{userName}/projects/{projectName}/sketches': {
      get: {
        tags: ['Arduino - Projects'],
        summary: 'List sketches in project',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Sketch list',
            content: { 'application/json': { schema: { type: 'object', properties: { sketches: { type: 'array', items: { type: 'string' } } } } } },
          },
        },
      },
    },
    '/users/{userName}/projects/{projectName}/sketches/{sketchName}/{fileName}': {
      get: {
        tags: ['Arduino - Projects'],
        summary: 'Read sketch file content',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'sketchName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'fileName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'File content', content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string' } } } } } },
          404: { description: 'File not found' },
        },
      },
      put: {
        tags: ['Arduino - Projects'],
        summary: 'Write sketch file content',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'sketchName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'fileName', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'File saved' } },
      },
    },
    '/vfs/capabilities': {
      get: {
        tags: ['VFS'],
        summary: 'Get VFS capabilities',
        responses: {
          200: {
            description: 'Capabilities flags',
            content: { 'application/json': { schema: { type: 'object', properties: { capabilities: { type: 'integer' } } } } },
          },
        },
      },
    },
    '/vfs/stat': {
      get: {
        tags: ['VFS'],
        summary: 'Stat a VFS path',
        parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'File stat', content: { 'application/json': { schema: { $ref: '#/components/schemas/VfsStat' } } } },
          404: { description: 'Path not found' },
        },
      },
    },
    '/vfs/readdir': {
      get: {
        tags: ['VFS'],
        summary: 'List directory contents',
        parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Directory entries',
            content: { 'application/json': { schema: { type: 'object', properties: { entries: { type: 'array', items: { $ref: '#/components/schemas/VfsEntry' } } } } } },
          },
          404: { description: 'Directory not found' },
        },
      },
    },
    '/vfs/readFile': {
      get: {
        tags: ['VFS'],
        summary: 'Read file content (base64-encoded)',
        parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'File content',
            content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string', format: 'byte', description: 'Base64-encoded file content' } } } } },
          },
          404: { description: 'File not found' },
        },
      },
    },
    '/vfs/writeFile': {
      post: {
        tags: ['VFS'],
        summary: 'Write file content (base64-encoded)',
        parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', format: 'byte', description: 'Base64-encoded file content' },
                  overwrite: { type: 'boolean' },
                  create: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'File written' }, 409: { description: 'File exists (overwrite=false)' } },
      },
    },
    '/vfs/delete': {
      post: {
        tags: ['VFS'],
        summary: 'Delete a VFS path',
        parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { recursive: { type: 'boolean' } } },
            },
          },
        },
        responses: { 200: { description: 'Deleted' }, 404: { description: 'Path not found' } },
      },
    },
    '/vfs/rename': {
      post: {
        tags: ['VFS'],
        summary: 'Rename/move a VFS path',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['oldPath', 'newPath'],
                properties: { oldPath: { type: 'string' }, newPath: { type: 'string' }, overwrite: { type: 'boolean' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Renamed' }, 404: { description: 'Source not found' }, 409: { description: 'Target exists' } },
      },
    },
    '/vfs/mkdir': {
      post: {
        tags: ['VFS'],
        summary: 'Create a directory',
        parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Directory created' }, 409: { description: 'Already exists' } },
      },
    },
    '/vfs/copy': {
      post: {
        tags: ['VFS'],
        summary: 'Copy a VFS path',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['source', 'destination'],
                properties: { source: { type: 'string' }, destination: { type: 'string' }, overwrite: { type: 'boolean' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Copied' }, 404: { description: 'Source not found' }, 409: { description: 'Target exists' } },
      },
    },
    '/users/{userName}/api-keys': {
      get: {
        tags: ['API Keys'],
        summary: 'List API keys for user',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'API key list', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/ApiKeyPublic' } } } } } } },
        },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Create API key',
        parameters: [{ name: 'userName', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
        responses: {
          201: { description: 'Created (raw key shown once)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiKeyCreateResponse' } } } },
        },
      },
    },
    '/users/{userName}/api-keys/{keyId}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Delete API key',
        parameters: [
          { name: 'userName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'keyId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Deleted' },
          404: { description: 'Key not found' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT or API Key (minis_...)',
      },
    },
    schemas: {
      UserPublic: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['user'] },
          id: { type: 'string' },
          name: { type: 'string' },
          isAdmin: { type: 'boolean' },
          roles: { type: 'array', items: { type: 'string' } },
        },
      },
      UserCreate: {
        type: 'object',
        required: ['name', 'password'],
        properties: {
          name: { type: 'string' },
          password: { type: 'string' },
          isAdmin: { type: 'boolean' },
          roles: { type: 'array', items: { type: 'string' } },
        },
      },
      DeviceDef: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          modules: { type: 'array', items: { type: 'string' } },
        },
      },
      ModuleDef: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          soc: { type: 'string' },
          isProgrammable: { type: 'boolean' },
        },
      },
      ProjectDef: {
        type: 'object',
        required: ['name', 'version', 'deviceDefId', 'moduleDefId', 'softwarePlatform'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          deviceDefId: { type: 'string' },
          moduleDefId: { type: 'string' },
          softwarePlatform: { type: 'string' },
          blocklyDef: { type: 'string' },
        },
      },
      IotDeviceConfig: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          userId: { type: 'string' },
          topicPrefix: { type: 'string' },
          heartbeatIntervalSec: { type: 'integer' },
          capabilities: { type: 'array', items: { $ref: '#/components/schemas/IotCapability' } },
          entities: { type: 'array', items: { $ref: '#/components/schemas/IotEntity' } },
          createdAt: { type: 'integer' },
          updatedAt: { type: 'integer' },
        },
      },
      IotDeviceConfigInput: {
        type: 'object',
        properties: {
          topicPrefix: { type: 'string' },
          heartbeatIntervalSec: { type: 'integer', default: 60 },
          capabilities: { type: 'array', items: { $ref: '#/components/schemas/IotCapability' } },
          entities: { type: 'array', items: { $ref: '#/components/schemas/IotEntity' } },
        },
      },
      IotEntity: {
        type: 'object',
        required: ['id', 'type', 'name'],
        properties: {
          id: { type: 'string', description: 'Unique within device, matches telemetry metric key' },
          type: { type: 'string', enum: ['sensor', 'binary_sensor', 'switch', 'number', 'button', 'select'] },
          name: { type: 'string' },
          icon: { type: 'string' },
          deviceClass: { type: 'string' },
          unit: { type: 'string', description: 'For sensor/number entities' },
          min: { type: 'number', description: 'For number entity' },
          max: { type: 'number', description: 'For number entity' },
          step: { type: 'number', description: 'For number entity' },
          options: { type: 'array', items: { type: 'string' }, description: 'For select entity' },
          onLabel: { type: 'string', description: 'For binary_sensor entity' },
          offLabel: { type: 'string', description: 'For binary_sensor entity' },
        },
      },
      IotCapability: {
        type: 'object',
        required: ['type', 'metricKey'],
        properties: {
          type: { type: 'string', enum: ['sensor', 'actuator'] },
          metricKey: { type: 'string' },
          unit: { type: 'string' },
          label: { type: 'string' },
          min: { type: 'number' },
          max: { type: 'number' },
          commandName: { type: 'string' },
        },
      },
      TelemetryRecord: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          userId: { type: 'string' },
          timestamp: { type: 'integer' },
          metrics: { type: 'array', items: { $ref: '#/components/schemas/TelemetryMetric' } },
        },
      },
      TelemetryMetric: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string' },
        },
      },
      DeviceCommand: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          deviceId: { type: 'string' },
          name: { type: 'string' },
          payload: { type: 'object' },
          status: { type: 'string', enum: ['PENDING', 'SENT', 'DELIVERED', 'EXECUTED', 'FAILED'] },
          createdAt: { type: 'integer' },
          updatedAt: { type: 'integer' },
        },
      },
      AlertRule: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          deviceId: { type: 'string' },
          name: { type: 'string' },
          metricKey: { type: 'string' },
          conditionOp: { type: 'string', enum: ['>', '<', '>=', '<=', '==', '!='] },
          conditionValue: { type: 'number' },
          severity: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL'] },
          cooldownMinutes: { type: 'integer' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'integer' },
        },
      },
      AlertRuleInput: {
        type: 'object',
        required: ['name', 'metricKey', 'conditionOp', 'conditionValue'],
        properties: {
          name: { type: 'string' },
          deviceId: { type: 'string' },
          metricKey: { type: 'string' },
          conditionOp: { type: 'string', enum: ['>', '<', '>=', '<=', '==', '!='] },
          conditionValue: { type: 'number' },
          severity: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'INFO' },
          cooldownMinutes: { type: 'integer', default: 15 },
          isActive: { type: 'boolean', default: true },
        },
      },
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ruleId: { type: 'string' },
          deviceId: { type: 'string' },
          userId: { type: 'string' },
          metricKey: { type: 'string' },
          metricValue: { type: 'number' },
          severity: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL'] },
          status: { type: 'string', enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] },
          message: { type: 'string' },
          firedAt: { type: 'integer' },
          acknowledgedAt: { type: 'integer', nullable: true },
          resolvedAt: { type: 'integer', nullable: true },
        },
      },
      DeviceShare: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ownerUserId: { type: 'string' },
          deviceId: { type: 'string' },
          targetUserId: { type: 'string' },
          createdAt: { type: 'integer' },
        },
      },
      IotDeviceStatus: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          status: { type: 'string', enum: ['ONLINE', 'OFFLINE'] },
          lastSeenAt: { type: 'integer' },
        },
      },
      ApiKeyPublic: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          prefix: { type: 'string', description: 'First 14 chars of the key (e.g. minis_a1b2c3)' },
          userId: { type: 'string' },
          userName: { type: 'string' },
          isAdmin: { type: 'boolean' },
          roles: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'integer' },
          lastUsedAt: { type: 'integer', nullable: true },
        },
      },
      ScriptInfo: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Script filename (e.g. hello.js)' },
          size: { type: 'integer', description: 'File size in bytes' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ScriptRunResult: {
        type: 'object',
        properties: {
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          exitCode: { type: 'integer', nullable: true },
          duration: { type: 'integer', description: 'Execution time in milliseconds' },
        },
      },
      ApiKeyCreateResponse: {
        type: 'object',
        properties: {
          key: { $ref: '#/components/schemas/ApiKeyPublic' },
          rawKey: { type: 'string', description: 'Full API key — shown only once' },
        },
      },
      Device: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          sn: { type: 'string' },
          description: { type: 'string' },
          isAssembled: { type: 'boolean' },
          isIot: { type: 'boolean' },
          deviceDefId: { type: 'string' },
          localizationId: { type: 'string' },
        },
      },
      DeviceInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
          sn: { type: 'string' },
          description: { type: 'string' },
          isAssembled: { type: 'boolean' },
          isIot: { type: 'boolean' },
          deviceDefId: { type: 'string' },
          localizationId: { type: 'string' },
        },
      },
      Localization: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['place', 'geo'] },
          place: { type: 'string' },
          geo: {
            type: 'object',
            nullable: true,
            properties: { lat: { type: 'number' }, lng: { type: 'number' } },
          },
          device: { type: 'string', description: 'Device ID associated with this localization' },
        },
      },
      LocalizationInput: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['place', 'geo'] },
          place: { type: 'string' },
          geo: { type: 'object', nullable: true, properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
          device: { type: 'string' },
        },
      },
      ArduinoBoard: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          fqbn: { type: 'string' },
        },
      },
      ArduinoCompileResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          stdout: { type: 'string' },
          stderr: { type: 'string' },
        },
      },
      VfsStat: {
        type: 'object',
        properties: {
          type: { type: 'integer', description: '1 = File, 2 = Directory' },
          ctime: { type: 'integer', description: 'Creation time (ms)' },
          mtime: { type: 'integer', description: 'Modified time (ms)' },
          size: { type: 'integer' },
        },
      },
      VfsEntry: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'integer', description: '1 = File, 2 = Directory' },
        },
      },
    },
  },
};
