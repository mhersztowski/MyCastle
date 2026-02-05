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
  ): Promise<unknown> {
    const fn = new Function(
      'api', 'input', 'variables',
      `"use strict";
       return (async () => {
         const inp = input;
         const vars = variables;
         ${script}
       })();`
    );

    const result = await Promise.race([
      fn(api, input, variables),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Script execution timeout (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);

    return result;
  }
}
