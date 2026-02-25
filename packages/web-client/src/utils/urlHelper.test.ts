import { configureUrls, getHttpUrl, getMqttUrl } from './urlHelper';

function mockWindowLocation(props: { protocol: string; host: string }) {
  Object.defineProperty(window, 'location', {
    value: { protocol: props.protocol, host: props.host },
    writable: true,
    configurable: true,
  });
}

describe('urlHelper', () => {
  beforeEach(() => {
    configureUrls({});
    mockWindowLocation({ protocol: 'http:', host: 'localhost:1894' });
  });

  describe('configureUrls', () => {
    it('overrides getHttpUrl with configured value', () => {
      configureUrls({ httpUrl: 'http://custom:9000' });
      expect(getHttpUrl()).toBe('http://custom:9000');
    });

    it('overrides getMqttUrl with configured value', () => {
      configureUrls({ mqttUrl: 'ws://custom:9000/mqtt' });
      expect(getMqttUrl()).toBe('ws://custom:9000/mqtt');
    });

    it('clears override when called with empty values', () => {
      configureUrls({ httpUrl: 'http://custom:9000', mqttUrl: 'ws://custom:9000/mqtt' });
      expect(getHttpUrl()).toBe('http://custom:9000');

      configureUrls({});
      expect(getHttpUrl()).toBe('http://localhost:1894');
    });
  });

  describe('getHttpUrl', () => {
    it('auto-detects from window.location when not configured', () => {
      expect(getHttpUrl()).toBe('http://localhost:1894');
    });

    it('uses https protocol from window.location', () => {
      mockWindowLocation({ protocol: 'https:', host: 'mycastle.example.com' });
      expect(getHttpUrl()).toBe('https://mycastle.example.com');
    });
  });

  describe('getMqttUrl', () => {
    it('auto-detects ws:// from http: protocol', () => {
      mockWindowLocation({ protocol: 'http:', host: 'localhost:1894' });
      expect(getMqttUrl()).toBe('ws://localhost:1894/mqtt');
    });

    it('auto-detects wss:// from https: protocol', () => {
      mockWindowLocation({ protocol: 'https:', host: 'mycastle.example.com' });
      expect(getMqttUrl()).toBe('wss://mycastle.example.com/mqtt');
    });

    it('appends /mqtt path', () => {
      mockWindowLocation({ protocol: 'http:', host: 'example.com' });
      const url = getMqttUrl();
      expect(url).toMatch(/\/mqtt$/);
    });
  });
});
