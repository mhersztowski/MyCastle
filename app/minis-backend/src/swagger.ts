import zodToJsonSchema from 'zod-to-json-schema';
import type { RpcMethodDef } from '@mhersztowski/core';
import type { RpcRouter } from './rpc/RpcRouter.js';

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
      ApiKeyCreateResponse: {
        type: 'object',
        properties: {
          key: { $ref: '#/components/schemas/ApiKeyPublic' },
          rawKey: { type: 'string', description: 'Full API key — shown only once' },
        },
      },
    },
  },
};
