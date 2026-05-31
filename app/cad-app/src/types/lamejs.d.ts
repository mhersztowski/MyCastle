declare module 'lamejs' {
  export class Mp3Encoder {
    constructor(channels: 1 | 2, sampleRate: number, bitrate: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
}
