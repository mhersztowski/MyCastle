/**
 * Eksport schematu do JSON Schema.
 *
 * Służy wyłącznie edytorom zewnętrznym: rozszerzenie YAML w VS Code czy
 * IntelliJ potrafi z tego zrobić uzupełnianie nazw pól i dymki z opisem.
 * Jest z założenia uboższy od walidatora — reguł wiążących pola ze sobą
 * („cel domyślny musi istnieć", „dwa układy nie mogą dzielić adresu")
 * w JSON Schema wyrazić się nie da. Podpowiadanie to jedno, sprawdzanie
 * poprawności to drugie; drugie zostaje po stronie `validate()`.
 */

import { HYDRA_SCHEMA } from './hydraSchema';
import { PACK_SCHEMA } from './pack';
import type { SchemaNode } from './schema';

export interface JsonSchema {
    [key: string]: unknown;
}

export function toJsonSchema(node: SchemaNode): JsonSchema {
    switch (node.kind) {
        case 'any':
            return { description: node.doc };

        case 'string': {
            const schema: JsonSchema = { type: 'string', description: node.doc };
            if (node.pattern) schema['pattern'] = node.pattern.source;
            if (node.minLength !== undefined) schema['minLength'] = node.minLength;
            return schema;
        }

        case 'number': {
            const schema: JsonSchema = {
                type: node.integer ? 'integer' : 'number',
                description: node.unit ? `${node.doc} [${node.unit}]` : node.doc,
            };
            if (node.min !== undefined) schema['minimum'] = node.min;
            if (node.max !== undefined) schema['maximum'] = node.max;
            return schema;
        }

        case 'bool':
            return { type: 'boolean', description: node.doc };

        case 'enum':
            return { type: 'string', enum: [...node.values], description: node.doc };

        case 'array': {
            const schema: JsonSchema = { type: 'array', items: toJsonSchema(node.of), description: node.doc };
            if (node.minItems !== undefined) schema['minItems'] = node.minItems;
            if (node.unique) schema['uniqueItems'] = true;
            return schema;
        }

        case 'object': {
            const properties: Record<string, JsonSchema> = {};
            const required: string[] = [];
            for (const [name, field] of Object.entries(node.fields)) {
                properties[name] = toJsonSchema(field.type);
                if (field.required) required.push(name);
            }
            const schema: JsonSchema = {
                type: 'object', description: node.doc, properties,
                additionalProperties: node.additional === 'allow',
            };
            if (required.length > 0) schema['required'] = required;
            return schema;
        }

        case 'map': {
            const schema: JsonSchema = {
                type: 'object', description: node.doc,
                additionalProperties: toJsonSchema(node.of),
            };
            if (node.keyPattern) schema['propertyNames'] = { pattern: node.keyPattern.source };
            // Klucze obsługiwane osobno opisujemy jako dowolne — inaczej
            // `targets.default` łamałby wzorzec nazw celów.
            if (node.reserved?.length) {
                schema['properties'] = Object.fromEntries(node.reserved.map((key) => [key, {}]));
                delete schema['propertyNames'];
            }
            return schema;
        }

        case 'union':
            return { description: node.doc, anyOf: node.options.map(toJsonSchema) };
    }
}

export function hydraJsonSchema(): JsonSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://platform-minis.dev/schema/hydra-0.4.json',
        title: 'Plik projektu Hydra (.hydra)',
        ...toJsonSchema(HYDRA_SCHEMA),
    };
}

export function packJsonSchema(): JsonSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://platform-minis.dev/schema/hydra-pack-1.json',
        title: 'Manifest paczki Hydry (hydra-pack.yaml)',
        ...toJsonSchema(PACK_SCHEMA),
    };
}
