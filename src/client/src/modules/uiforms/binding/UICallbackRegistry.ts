/**
 * UI Callback Registry - globalny rejestr callback'ów
 */

type CallbackFunction = (...args: unknown[]) => unknown;

class UICallbackRegistryClass {
  private callbacks = new Map<string, CallbackFunction>();

  /**
   * Zarejestruj callback
   */
  register(name: string, callback: CallbackFunction): void {
    this.callbacks.set(name, callback);
  }

  /**
   * Wyrejestruj callback
   */
  unregister(name: string): void {
    this.callbacks.delete(name);
  }

  /**
   * Pobierz callback
   */
  get(name: string): CallbackFunction | undefined {
    return this.callbacks.get(name);
  }

  /**
   * Sprawdź czy callback istnieje
   */
  has(name: string): boolean {
    return this.callbacks.has(name);
  }

  /**
   * Wywołaj callback
   */
  invoke(name: string, ...args: unknown[]): unknown {
    const callback = this.callbacks.get(name);
    if (!callback) {
      console.warn(`[UICallbackRegistry] Callback not found: ${name}`);
      return undefined;
    }
    return callback(...args);
  }

  /**
   * Pobierz wszystkie nazwy callback'ów
   */
  getNames(): string[] {
    return Array.from(this.callbacks.keys());
  }

  /**
   * Wyczyść wszystkie callback'i
   */
  clear(): void {
    this.callbacks.clear();
    this.registerBuiltins();
  }

  /**
   * Zarejestruj wbudowane callback'i
   */
  registerBuiltins(): void {
    // Navigation
    this.register('navigate', (path: unknown) => {
      if (typeof path === 'string') {
        window.location.href = path;
      }
    });

    // Console log (for debugging)
    this.register('log', (...args: unknown[]) => {
      console.log('[UIForm]', ...args);
    });

    // Alert
    this.register('alert', (message: unknown) => {
      if (typeof message === 'string') {
        window.alert(message);
      }
    });

    // Confirm
    this.register('confirm', (message: unknown) => {
      if (typeof message === 'string') {
        return window.confirm(message);
      }
      return false;
    });

    // Prompt
    this.register('prompt', (message: unknown, defaultValue?: unknown) => {
      if (typeof message === 'string') {
        return window.prompt(message, typeof defaultValue === 'string' ? defaultValue : '');
      }
      return null;
    });

    // Copy to clipboard
    this.register('copyToClipboard', async (text: unknown) => {
      if (typeof text === 'string') {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    });

    // Open URL in new tab
    this.register('openUrl', (url: unknown) => {
      if (typeof url === 'string') {
        window.open(url, '_blank');
      }
    });

    // Scroll to element
    this.register('scrollTo', (elementId: unknown) => {
      if (typeof elementId === 'string') {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    // Focus element
    this.register('focus', (elementId: unknown) => {
      if (typeof elementId === 'string') {
        const element = document.getElementById(elementId) as HTMLElement;
        if (element && typeof element.focus === 'function') {
          element.focus();
        }
      }
    });

    // Get current date/time
    this.register('now', () => {
      return new Date().toISOString();
    });

    // Get current date (without time)
    this.register('today', () => {
      return new Date().toISOString().split('T')[0];
    });

    // Generate UUID
    this.register('uuid', () => {
      return crypto.randomUUID();
    });

    // Format date
    this.register('formatDate', (date: unknown, format?: unknown) => {
      if (!date) return '';
      const d = new Date(date as string);
      if (isNaN(d.getTime())) return '';

      const formatStr = typeof format === 'string' ? format : 'yyyy-MM-dd';

      const pad = (n: number) => n.toString().padStart(2, '0');

      return formatStr
        .replace('yyyy', d.getFullYear().toString())
        .replace('MM', pad(d.getMonth() + 1))
        .replace('dd', pad(d.getDate()))
        .replace('HH', pad(d.getHours()))
        .replace('mm', pad(d.getMinutes()))
        .replace('ss', pad(d.getSeconds()));
    });

    // String operations
    this.register('uppercase', (str: unknown) => {
      return typeof str === 'string' ? str.toUpperCase() : str;
    });

    this.register('lowercase', (str: unknown) => {
      return typeof str === 'string' ? str.toLowerCase() : str;
    });

    this.register('trim', (str: unknown) => {
      return typeof str === 'string' ? str.trim() : str;
    });

    this.register('concat', (...args: unknown[]) => {
      return args.map(a => String(a ?? '')).join('');
    });

    // Math operations
    this.register('add', (a: unknown, b: unknown) => {
      return Number(a) + Number(b);
    });

    this.register('subtract', (a: unknown, b: unknown) => {
      return Number(a) - Number(b);
    });

    this.register('multiply', (a: unknown, b: unknown) => {
      return Number(a) * Number(b);
    });

    this.register('divide', (a: unknown, b: unknown) => {
      const divisor = Number(b);
      if (divisor === 0) return 0;
      return Number(a) / divisor;
    });

    this.register('round', (value: unknown, decimals?: unknown) => {
      const num = Number(value);
      const dec = Number(decimals) || 0;
      return Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec);
    });

    // Conditional
    this.register('if', (condition: unknown, ifTrue: unknown, ifFalse: unknown) => {
      return condition ? ifTrue : ifFalse;
    });

    // Array operations
    this.register('first', (arr: unknown) => {
      return Array.isArray(arr) ? arr[0] : undefined;
    });

    this.register('last', (arr: unknown) => {
      return Array.isArray(arr) ? arr[arr.length - 1] : undefined;
    });

    this.register('length', (arr: unknown) => {
      if (Array.isArray(arr)) return arr.length;
      if (typeof arr === 'string') return arr.length;
      return 0;
    });

    this.register('join', (arr: unknown, separator?: unknown) => {
      if (Array.isArray(arr)) {
        return arr.join(typeof separator === 'string' ? separator : ', ');
      }
      return '';
    });
  }
}

// Singleton instance
export const UICallbackRegistry = new UICallbackRegistryClass();

// Initialize with builtins
UICallbackRegistry.registerBuiltins();
