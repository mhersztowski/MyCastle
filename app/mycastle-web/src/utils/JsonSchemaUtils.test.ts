import {
  JsonSchemaUtils,
  generateTemplateFromSchema,
  resolveRefFromSchemas,
  JsonSchema,
} from './JsonSchemaUtils';

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const personSchema: JsonSchema = {
  type: 'object',
  required: ['name', 'age'],
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    email: { type: 'string', format: 'email' },
  },
};

const stringFormatSchema: JsonSchema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    date: { type: 'string', format: 'date' },
    uri: { type: 'string', format: 'uri' },
  },
};

const addressSchema: JsonSchema = {
  $id: 'address',
  type: 'object',
  required: ['street'],
  properties: {
    street: { type: 'string' },
    city: { type: 'string' },
  },
};

const schemaWithDefinitions: JsonSchema = {
  type: 'object',
  definitions: {
    Color: {
      type: 'object',
      properties: {
        r: { type: 'integer' },
        g: { type: 'integer' },
        b: { type: 'integer' },
      },
    },
  },
  properties: {
    background: { $ref: '#/definitions/Color' },
  },
} as JsonSchema & { definitions: Record<string, JsonSchema> };

// ---------------------------------------------------------------------------
// JsonSchemaUtils.validate()
// ---------------------------------------------------------------------------

describe('JsonSchemaUtils.validate()', () => {
  it('returns valid:true for matching data', () => {
    const result = JsonSchemaUtils.validate(
      { name: 'Alice', age: 30 },
      personSchema,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for type mismatch', () => {
    const result = JsonSchemaUtils.validate(
      { name: 'Alice', age: 'thirty' },
      personSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.path === '/age')).toBe(true);
  });

  it('reports all errors (allErrors:true)', () => {
    const result = JsonSchemaUtils.validate(
      { name: 123, age: 'bad' },
      personSchema,
    );
    expect(result.valid).toBe(false);
    // Should report errors on both name and age
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('/name');
    expect(paths).toContain('/age');
  });

  it('validates required properties', () => {
    const result = JsonSchemaUtils.validate({ name: 'Alice' }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === 'required')).toBe(true);
  });

  it('validates string format (email, date, uri)', () => {
    const result = JsonSchemaUtils.validate(
      { email: 'not-an-email', date: 'not-a-date', uri: ':::bad' },
      stringFormatSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.keyword === 'format')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JsonSchemaUtils.validateString()
// ---------------------------------------------------------------------------

describe('JsonSchemaUtils.validateString()', () => {
  it('parses JSON string and validates against schema', () => {
    const json = JSON.stringify({ name: 'Bob', age: 25 });
    const result = JsonSchemaUtils.validateString(json, personSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns parse error for invalid JSON', () => {
    const result = JsonSchemaUtils.validateString('{bad json}', personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].keyword).toBe('parse');
    expect(result.errors[0].message).toContain('Invalid JSON');
  });
});

// ---------------------------------------------------------------------------
// JsonSchemaUtils.validateWithRefs()
// ---------------------------------------------------------------------------

describe('JsonSchemaUtils.validateWithRefs()', () => {
  it('resolves $ref from additional schemas Map', () => {
    const mainSchema = {
      type: 'object',
      properties: {
        home: { $ref: 'address' },
      },
    };

    const refs = new Map<string, object>();
    refs.set('address', addressSchema);

    const result = JsonSchemaUtils.validateWithRefs(
      { home: { street: '123 Main St', city: 'NYC' } },
      mainSchema,
      refs,
    );
    expect(result.valid).toBe(true);
  });

  it('validates nested $ref chains', () => {
    const innerSchema = {
      $id: 'inner',
      type: 'object',
      required: ['value'],
      properties: { value: { type: 'number' } },
    };

    const outerSchema = {
      $id: 'outer',
      type: 'object',
      properties: { nested: { $ref: 'inner' } },
    };

    const mainSchema = {
      type: 'object',
      properties: { wrapper: { $ref: 'outer' } },
    };

    const refs = new Map<string, object>();
    refs.set('inner', innerSchema);
    refs.set('outer', outerSchema);

    // Valid data
    const validResult = JsonSchemaUtils.validateWithRefs(
      { wrapper: { nested: { value: 42 } } },
      mainSchema,
      refs,
    );
    expect(validResult.valid).toBe(true);

    // Invalid: value should be number
    const invalidResult = JsonSchemaUtils.validateWithRefs(
      { wrapper: { nested: { value: 'not-a-number' } } },
      mainSchema,
      refs,
    );
    expect(invalidResult.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JsonSchemaUtils.validateStringWithRefs()
// ---------------------------------------------------------------------------

describe('JsonSchemaUtils.validateStringWithRefs()', () => {
  it('includes source positions (line/column) in errors', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    };

    const json = '{\n  "name": 123\n}';
    const result = JsonSchemaUtils.validateStringWithRefs(
      json,
      schema,
      new Map(),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);

    const nameError = result.errors.find((e) => e.path === '/name');
    expect(nameError).toBeDefined();
    expect(nameError!.position).toBeDefined();
    expect(nameError!.position!.line).toBeGreaterThan(0);
    expect(nameError!.position!.column).toBeGreaterThan(0);
  });

  it('reports correct position for nested property errors', () => {
    const schema = {
      type: 'object',
      properties: {
        outer: {
          type: 'object',
          properties: {
            inner: { type: 'number' },
          },
        },
      },
    };

    const json = '{\n  "outer": {\n    "inner": "wrong"\n  }\n}';
    const result = JsonSchemaUtils.validateStringWithRefs(
      json,
      schema,
      new Map(),
    );

    expect(result.valid).toBe(false);
    const innerError = result.errors.find(
      (e) => e.path === '/outer/inner',
    );
    expect(innerError).toBeDefined();
    expect(innerError!.position).toBeDefined();
    // "inner" value starts on line 3 (1-indexed)
    expect(innerError!.position!.line).toBe(3);
  });

  it('handles invalid JSON with position info from parse error', () => {
    const result = JsonSchemaUtils.validateStringWithRefs(
      '{\n  "key": \n}',
      { type: 'object' },
      new Map(),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].keyword).toBe('parse');
    expect(result.errors[0].message).toContain('Invalid JSON');
  });
});

// ---------------------------------------------------------------------------
// JsonSchemaUtils.validateToStrings()
// ---------------------------------------------------------------------------

describe('JsonSchemaUtils.validateToStrings()', () => {
  it('returns empty array for valid data', () => {
    const result = JsonSchemaUtils.validateToStrings(
      { name: 'Alice', age: 30 },
      personSchema,
    );
    expect(result).toEqual([]);
  });

  it('returns formatted error strings "path: message"', () => {
    const result = JsonSchemaUtils.validateToStrings(
      { name: 'Alice', age: 'bad' },
      personSchema,
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Each error should contain a colon-separated "path: message"
    for (const msg of result) {
      expect(msg).toMatch(/.*: .+/);
    }
    // At least one error should reference /age
    expect(result.some((s) => s.startsWith('/age:'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateTemplateFromSchema()
// ---------------------------------------------------------------------------

describe('generateTemplateFromSchema()', () => {
  it('generates object with required and optional properties', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer' },
        label: { type: 'string' },
      },
    };

    const result = generateTemplateFromSchema(schema, new Map()) as Record<
      string,
      unknown
    >;
    expect(result).toHaveProperty('id', 0);
    expect(result).toHaveProperty('label', '');
  });

  it('handles default values', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        count: { type: 'integer', default: 5 },
        tag: { type: 'string', default: 'hello' },
      },
    };

    const result = generateTemplateFromSchema(schema, new Map()) as Record<
      string,
      unknown
    >;
    expect(result.count).toBe(5);
    expect(result.tag).toBe('hello');
  });

  it('handles enum (picks first or default)', () => {
    const schemaNoDefault: JsonSchema = {
      type: 'string',
      enum: ['alpha', 'beta', 'gamma'],
    };
    expect(generateTemplateFromSchema(schemaNoDefault, new Map())).toBe(
      'alpha',
    );

    const schemaWithDefault: JsonSchema = {
      type: 'string',
      enum: ['alpha', 'beta', 'gamma'],
      default: 'beta',
    };
    expect(generateTemplateFromSchema(schemaWithDefault, new Map())).toBe(
      'beta',
    );
  });

  it('handles const', () => {
    const schema: JsonSchema = { const: 'fixed-value' };
    expect(generateTemplateFromSchema(schema, new Map())).toBe('fixed-value');
  });

  it('generates string defaults by format', () => {
    const schemas = new Map<string, object>();

    const emailSchema: JsonSchema = { type: 'string', format: 'email' };
    expect(generateTemplateFromSchema(emailSchema, schemas)).toBe(
      'user@example.com',
    );

    const uriSchema: JsonSchema = { type: 'string', format: 'uri' };
    expect(generateTemplateFromSchema(uriSchema, schemas)).toBe(
      'https://example.com',
    );

    const dateSchema: JsonSchema = { type: 'string', format: 'date' };
    const dateResult = generateTemplateFromSchema(dateSchema, schemas) as string;
    // Should look like YYYY-MM-DD
    expect(dateResult).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('generates array with one item template', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'string' },
    };

    const result = generateTemplateFromSchema(schema, new Map());
    expect(result).toEqual(['']);
  });

  it('generates nested object hierarchies', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            zip: { type: 'integer' },
          },
        },
      },
    };

    const result = generateTemplateFromSchema(schema, new Map()) as Record<
      string,
      unknown
    >;
    expect(result.address).toEqual({ street: '', zip: 0 });
  });

  it('handles $ref resolution from loadedSchemas', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        bg: { $ref: '#/definitions/Color' },
      },
    };

    const schemas = new Map<string, object>();
    schemas.set('main', schemaWithDefinitions);

    const result = generateTemplateFromSchema(schema, schemas) as Record<
      string,
      unknown
    >;
    expect(result.bg).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('handles allOf merging', () => {
    const baseSchema: JsonSchema = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' } },
    };

    const extSchema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };

    const schemas = new Map<string, object>();
    schemas.set('base', baseSchema);
    schemas.set('ext', extSchema);

    const schema: JsonSchema = {
      allOf: [{ $ref: 'base' }, { $ref: 'ext' }],
    };

    // resolveRefFromSchemas matches by path equality, so refs here match the Map keys
    const result = generateTemplateFromSchema(schema, schemas) as Record<
      string,
      unknown
    >;
    expect(result).toHaveProperty('id', 0);
    expect(result).toHaveProperty('name', '');
  });

  it('detects circular $ref and returns null', () => {
    const schemas = new Map<string, object>();
    schemas.set('main', {
      definitions: {
        Node: {
          type: 'object',
          properties: {
            child: { $ref: '#/definitions/Node' },
          },
        },
      },
    });

    const schema: JsonSchema = { $ref: '#/definitions/Node' };
    const result = generateTemplateFromSchema(schema, schemas) as Record<
      string,
      unknown
    >;

    // The first level resolves, but the nested child should hit the circular guard
    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).child).toBeNull();
  });

  it('returns null/false/0 for primitive types without defaults', () => {
    expect(
      generateTemplateFromSchema({ type: 'number' }, new Map()),
    ).toBe(0);
    expect(
      generateTemplateFromSchema({ type: 'integer' }, new Map()),
    ).toBe(0);
    expect(
      generateTemplateFromSchema({ type: 'boolean' }, new Map()),
    ).toBe(false);
    expect(
      generateTemplateFromSchema({ type: 'null' }, new Map()),
    ).toBeNull();
    expect(
      generateTemplateFromSchema({ type: 'string' }, new Map()),
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------
// resolveRefFromSchemas()
// ---------------------------------------------------------------------------

describe('resolveRefFromSchemas()', () => {
  it('resolves local #/definitions/ refs', () => {
    const schemas = new Map<string, object>();
    schemas.set('main', {
      definitions: {
        Foo: { type: 'string' },
      },
    });

    const result = resolveRefFromSchemas('#/definitions/Foo', schemas);
    expect(result).toEqual({ type: 'string' });
  });

  it('resolves external refs by path', () => {
    const schemas = new Map<string, object>();
    schemas.set('schemas/address.json', addressSchema);

    const result = resolveRefFromSchemas('schemas/address.json', schemas);
    expect(result).toBe(addressSchema);
  });

  it('resolves external refs by suffix match', () => {
    const schemas = new Map<string, object>();
    schemas.set('address.json', addressSchema);

    const result = resolveRefFromSchemas(
      'data/schemas/address.json',
      schemas,
    );
    expect(result).toBe(addressSchema);
  });

  it('returns null for unresolvable ref', () => {
    const schemas = new Map<string, object>();
    const result = resolveRefFromSchemas('#/definitions/Missing', schemas);
    expect(result).toBeNull();
  });
});
