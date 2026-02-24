export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Minis API',
    description: 'REST API for Minis DIY platform',
    version: '1.0.0',
  },
  servers: [{ url: '/api' }],
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
                required: ['userId', 'password'],
                properties: {
                  userId: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPublic' } } },
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
    '/users/{userId}/projects': {
      get: {
        tags: ['User - Projects'],
        summary: 'List user projects',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project list' } },
      },
      post: {
        tags: ['User - Projects'],
        summary: 'Create user project from definition',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['projectDefId'], properties: { projectDefId: { type: 'string' } } },
            },
          },
        },
        responses: { 201: { description: 'Project created' } },
      },
    },
  },
  components: {
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
    },
  },
};
