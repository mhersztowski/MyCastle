import { Signal } from '@mhersztowski/minislib';
import { Service } from './Service';
import { EnumLogKind, type LogService } from './LogService';

/**
 * Console service — writes to the process stdout/stderr and (optionally)
 * mirrors lines into the LogService so console output is observable/streamable.
 */
export class ConsoleService extends Service {
  readonly name = 'console';
  readonly onWrite = new Signal<[string]>();

  constructor(private readonly log?: LogService) {
    super();
  }

  write(text: string): void {
    process.stdout.write(text);
    this.onWrite.emit(text);
    this.log?.log({ message: text, kind: EnumLogKind.Log, source: 'console' });
  }

  line(text = ''): void {
    this.write(`${text}\n`);
  }

  error(text: string): void {
    process.stderr.write(`${text}\n`);
    this.onWrite.emit(text);
    this.log?.log({ message: text, kind: EnumLogKind.Error, source: 'console' });
  }
}
