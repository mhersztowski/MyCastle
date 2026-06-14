/**
 * Sandbox - bezpieczne wykonywanie skryptów JS
 */

import { AutomateSystemApiInterface } from './AutomateSystemApi';

const DEFAULT_TIMEOUT_MS = 120000;

export class AutomateSandbox {
  static async execute(
    script: string,
    api: AutomateSystemApiInterface,
    input: Record<string, unknown>,
    variables: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    /** Dodatkowe zmienne wstrzykiwane jako lokalne `const` (przesłaniają globalne).
     *  Używane do start/stop: nadpisuje setTimeout/setInterval/requestAnimationFrame
     *  (śledzone i czyszczone przy Stop) oraz daje `signal`/`onStop`/`isStopped`. */
    hostScope?: Record<string, unknown>,
  ): Promise<unknown> {
    const hostKeys = hostScope ? Object.keys(hostScope) : [];
    // Tylko gdy host podany — inaczej nie przesłaniaj globali (kompatybilność).
    const prelude = hostKeys.length ? `const { ${hostKeys.join(', ')} } = host;\n` : '';
    const fn = new Function(
      'api', 'input', 'variables', 'host',
      `"use strict";
       return (async () => {
         const inp = input;
         const vars = variables;
         ${prelude}${script}
       })();`
    );

    const result = await Promise.race([
      fn(api, input, variables, hostScope || {}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Script execution timeout (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);

    return result;
  }
}
