declare module 'aedes' {
  import { EventEmitter } from 'events';
  import { Socket } from 'net';

  export interface Client {
    id: string;
    connected: boolean;
    publish(packet: PublishPacket, callback?: (err?: Error) => void): void;
    close(): void;
  }

  export interface PublishPacket {
    cmd: 'publish';
    qos: 0 | 1 | 2;
    topic: string;
    payload: Buffer | string;
    dup: boolean;
    retain: boolean;
  }

  export interface Aedes extends EventEmitter {
    handle: (client: Socket) => void;
    publish(packet: PublishPacket, callback?: (err?: Error) => void): void;
    close(callback?: () => void): void;
    on(event: 'client', listener: (client: Client) => void): this;
    on(event: 'clientDisconnect', listener: (client: Client) => void): this;
    on(event: 'publish', listener: (packet: PublishPacket, client: Client | null) => void): this;
  }

  export default function aedes(): Aedes;
}
