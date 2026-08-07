/**
 * Zapisuje JSON Schema do katalogu schema/.
 *
 * Pliki są wynikiem, nie źródłem — źródłem jest src/model/hydraSchema.ts.
 * Trzymamy je w repozytorium, bo mają je czytać edytory bez budowania pakietu,
 * a test pilnuje, żeby nie zdążyły się zestarzeć.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { hydraJsonSchema, packJsonSchema } = await import(join(here, '../dist/model.js'));

const out = join(here, '../schema');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'hydra.schema.json'), JSON.stringify(hydraJsonSchema(), null, 2) + '\n');
writeFileSync(join(out, 'hydra-pack.schema.json'), JSON.stringify(packJsonSchema(), null, 2) + '\n');
console.log('zapisano schema/hydra.schema.json i schema/hydra-pack.schema.json');
